//! Bounded geometric routing proxy, not a connectivity proof. No A* and no vias
//! invented from line intersections. Length already exists in the block objective;
//! this module charges only detour, foreign pads, clearance bands and crossings.
use crate::geometry::{Box2, Point};
use crate::model::{Primitive, RouteObstacle};
use crate::net_class::is_ground;
use std::sync::Arc;

mod arithmetic;
pub(crate) mod plan;
#[cfg(feature="gpu")]
mod gpu;
use plan::{Cost, Plan};

type Segment = (Point, Point);

pub fn candidate_penalty(
    candidate: &Primitive,
    placed: &[&Primitive],
    obstacles: &[RouteObstacle],
    external: &[Arc<str>],
    ignored: &[Arc<str>],
    clearance: f32,
    bounds: Box2,
    relations: &[crate::model::Relation],
) -> f32 {
    candidate_plan(candidate, placed, obstacles, external, ignored, clearance, bounds, relations).cpu()
}

pub fn board_candidate_penalty(candidate: &Primitive, placed: &[&Primitive], obstacles: &[RouteObstacle], clearance: f32, bounds: Box2, relations: &[crate::model::Relation]) -> f32 {
    let mut plan=Plan::default();
    let root=candidate_penalty_inner(&mut plan,candidate, placed, obstacles, &[], &[], clearance, bounds, true, relations);
    plan.root(root); plan.cpu()
}

fn candidate_penalty_inner(plan:&mut Plan, candidate: &Primitive, placed: &[&Primitive], obstacles: &[RouteObstacle], external: &[Arc<str>], ignored: &[Arc<str>], clearance: f32, bounds: Box2, board: bool, relations: &[crate::model::Relation]) -> Cost {
    let all:Vec<_>=placed.iter().copied().chain(std::iter::once(candidate)).collect();
    let explicit=explicit_connections(&all,relations,obstacles);
    let eligible = |n: &str| {
        !n.is_empty() && !is_ground(n) && !ignored.iter().any(|s| s.eq_ignore_ascii_case(n))
    };
    let mut nets: Vec<_> = candidate
        .connection_points
        .iter()
        .filter_map(|p| p.net.clone())
        .filter(|n| eligible(n))
        .collect();
    nets.sort();
    nets.dedup();
    // Existing connection skeleton is only a crossing hint. Never charge all-pairs
    // bus length; grow a deterministic nearest-edge spanning tree per net.
    let mut skeleton = skeleton(placed, &eligible, if board {usize::MAX} else {32});
    extend_explicit_skeleton(&mut skeleton,&explicit);
    let mut ordinary_layers=CompatibleLinks::new(&skeleton,placed,obstacles);
    let mut explicit_layers=CompatibleLinks::new(&skeleton,&all,obstacles);
    let mut total = Cost::Constant(0.0);
    for net in nets {
        let sources: Vec<_> = candidate
            .connection_points
            .iter()
            .filter(|p| p.net.as_ref() == Some(&net))
            .collect();
        let mut pairs = Vec::new();
        for source in &sources {
            for p in placed {
                for target in p
                    .connection_points
                    .iter()
                    .filter(|p| p.net.as_ref() == Some(&net))
                {
                    let a = Point {
                        x: source.x,
                        y: source.y,
                    };
                    let b = Point {
                        x: target.x,
                        y: target.y,
                    };
                    pairs.push((
                        distance(a, b),
                        a,
                        b,
                        common_layer(&source.reference, &target.reference, obstacles),
                    ));
                }
            }
        }
        pairs.sort_by(|a, b| a.0.total_cmp(&b.0));
        if let Some(best) = pairs
            .iter()
            .filter(|(_,a,b,_)| explicit_class(&net,*a,*b,&explicit)==0)
            .take(4)
            .map(|(_, a, b, layer)| {
                let compatible = if board { ordinary_layers.get(layer.as_deref()) } else { &skeleton };
                plan.path(
                    *a,
                    *b,
                    &net,
                    obstacles,
                    compatible,
                    clearance,
                    layer.as_deref(),
                    &explicit,
                )
            })
            .reduce(Cost::min)
        {
            total = total + best;
        }
        if external.contains(&net) {
            // Keep an escape to some side of the block; actual neighbour direction
            // becomes known only to board-level portfolio selection.
            let mut escapes=Vec::new();
            for p in &sources {
                let a=Point{x:p.x,y:p.y};
                for b in [Point{x:bounds.left,y:p.y},Point{x:bounds.right,y:p.y},Point{x:p.x,y:bounds.top},Point{x:p.x,y:bounds.bottom}] {
                    escapes.push(plan.path(a,b,&net,obstacles,&skeleton,clearance,pad_layer(&p.reference,obstacles),&[])+distance(a,b)*0.25);
                }
            }
            let escape=escapes.into_iter().reduce(Cost::min).unwrap_or(Cost::Constant(0.0));
            total = total + escape * 0.5;
        }
    }
    let mut seen=Vec::new();
    for e in &explicit {
        if !candidate.connection_points.iter().any(|p|p.net.as_ref()==Some(&e.net) && (distance(Point{x:p.x,y:p.y},e.source)<0.001||distance(Point{x:p.x,y:p.y},e.target)<0.001)) {continue;}
        if distance(e.source,e.target)<0.001 || seen.iter().any(|other:&crate::model::ExplicitConnection|same_explicit(other,e)) {continue;}
        seen.push(e.clone());
        let compatible=explicit_layers.get(e.layer.as_deref());
        total=total+plan.path(e.source,e.target,&e.net,obstacles,&compatible,clearance,e.layer.as_deref(),&explicit);
    }
    total
}

/// A new block can obstruct existing links even when it shares none of their nets.
/// Reuse path_cost and charge only the additional obstruction, keeping the lazy
/// board shortlist's non-negative correction bound valid.
fn added_obstacle_plan(
    plan:&mut Plan, placed: &[&Primitive], all: &[RouteObstacle], added: &[RouteObstacle], clearance: f32, relations: &[crate::model::Relation],
) -> Cost {
    if added.is_empty() { return Cost::Constant(0.0); }
    let before: Vec<_> = all.iter().filter(|p| !added.iter().any(|q|
        p.primitive_id == q.primitive_id && p.reference == q.reference)).cloned().collect();
    let explicit=explicit_connections(placed,relations,all);
    let mut links = skeleton(placed, &|n| !n.is_empty() && !is_ground(n), usize::MAX);
    extend_explicit_skeleton(&mut links,&explicit);
    let mut compatible=CompatibleLinks::new(&links,placed,all);
    links.iter().enumerate().map(|(index,(net, (a,b)))| {
        let layer = compatible.layers[index].clone();
        let compatible = compatible.get(layer.as_deref());
        plan.path(*a,*b,net,all,&compatible,clearance,layer.as_deref(),&explicit)
            .positive_difference(plan.path(*a,*b,net,&before,&compatible,clearance,layer.as_deref(),&explicit))
    }).sum()
}

fn link_layer(net: &str, a: Point, b: Point, primitives: &[&Primitive], obstacles: &[RouteObstacle]) -> Option<Arc<str>> {
    let reference = |point: Point| primitives.iter().flat_map(|p| p.connection_points.iter())
        .find(|cp| cp.net.as_deref() == Some(net) && cp.x == point.x && cp.y == point.y)
        .map(|cp| cp.reference.as_ref());
    match (reference(a),reference(b)) {
        (Some(a),Some(b)) => common_layer(a,b,obstacles), _ => None,
    }
}
// Layer lookup walks the placement geometry. Resolve it once per skeleton,
// then reuse each filtered list for every endpoint alternative / before-after job.
struct CompatibleLinks<'a> {
    links: &'a [(Arc<str>,Segment)], layers: Vec<Option<Arc<str>>>,
    filtered: std::collections::BTreeMap<Arc<str>,Vec<(Arc<str>,Segment)>>,
}
impl<'a> CompatibleLinks<'a> {
    fn new(links:&'a [(Arc<str>,Segment)],primitives:&[&Primitive],obstacles:&[RouteObstacle])->Self {
        Self{links,layers:links.iter().map(|(n,(a,b))|link_layer(n,*a,*b,primitives,obstacles)).collect(),filtered:Default::default()}
    }
    fn get(&mut self,layer:Option<&str>)->&[(Arc<str>,Segment)] {
        let Some(layer)=layer else { return self.links; };
        self.filtered.entry(Arc::from(layer)).or_insert_with(||self.links.iter().zip(&self.layers)
            .filter(|(_,other)|other.is_none() || other.as_deref()==Some(layer)).map(|(link,_)|link.clone()).collect())
    }
}

fn skeleton(
    primitives: &[&Primitive],
    eligible: &impl Fn(&str) -> bool,
    max_points: usize,
) -> Vec<(Arc<str>, Segment)> {
    let mut nets = std::collections::BTreeMap::<Arc<str>, Vec<Point>>::new();
    for p in primitives {
        for cp in p.connection_points.iter() {
            if let Some(n) = &cp.net {
                if eligible(n) {
                    nets.entry(n.clone())
                        .or_default()
                        .push(Point { x: cp.x, y: cp.y });
                }
            }
        }
    }
    let mut result = Vec::new();
    for (n, mut pts) in nets {
        pts.sort_by(|a, b| a.x.total_cmp(&b.x).then(a.y.total_cmp(&b.y)));
        pts.dedup_by(|a, b| distance(*a, *b) < 1e-6);
        if pts.len() < 2 || pts.len() > max_points {
            continue;
        }
        let mut used = vec![false; pts.len()];
        used[0] = true;
        for _ in 1..pts.len() {
            let mut best = (f32::INFINITY, 0, 0);
            for a in 0..pts.len() {
                if !used[a] {
                    continue;
                }
                for b in 0..pts.len() {
                    if used[b] {
                        continue;
                    }
                    let d = distance(pts[a], pts[b]);
                    if d < best.0 {
                        best = (d, a, b);
                    }
                }
            }
            used[best.2] = true;
            result.push((n.clone(), (pts[best.1], pts[best.2])));
        }
    }
    result
}

fn pad_layer<'a>(reference: &str, obstacles: &'a [RouteObstacle]) -> Option<&'a str> {
    obstacles
        .iter()
        .find(|p| p.reference.as_deref() == Some(reference))
        .and_then(|p| p.layer.as_deref())
}

fn common_layer(a: &str, b: &str, obstacles: &[RouteObstacle]) -> Option<Arc<str>> {
    match (pad_layer(a, obstacles), pad_layer(b, obstacles)) {
        (Some(a), Some(b)) if a == b => Some(Arc::from(a)),
        (Some(a), None) | (None, Some(a)) => Some(Arc::from(a)),
        _ => None, // Mixed-side or through-hole pair: conservative projection.
    }
}

fn same_explicit(a:&crate::model::ExplicitConnection,b:&crate::model::ExplicitConnection)->bool {
 a.net==b.net && ((distance(a.source,b.source)<0.001&&distance(a.target,b.target)<0.001)||(distance(a.source,b.target)<0.001&&distance(a.target,b.source)<0.001))
}
fn explicit_class(net:&str,a:Point,b:Point,links:&[crate::model::ExplicitConnection])->u32 {
 links.iter().filter(|e|e.net.as_ref()==net && ((distance(a,e.source)<0.001&&distance(b,e.target)<0.001)||(distance(a,e.target)<0.001&&distance(b,e.source)<0.001)))
 .map(|e|crate::relation_score::connection_class(&e.kind)).max().unwrap_or(0)
}
fn extend_explicit_skeleton(skeleton:&mut Vec<(Arc<str>,Segment)>,explicit:&[crate::model::ExplicitConnection]) {
 for e in explicit {if distance(e.source,e.target)<0.001 {continue;}if !skeleton.iter().any(|(n,(a,b))|n==&e.net && ((distance(*a,e.source)<0.001&&distance(*b,e.target)<0.001)||(distance(*a,e.target)<0.001&&distance(*b,e.source)<0.001))) {skeleton.push((e.net.clone(),(e.source,e.target)));}}
}
fn path_cost(a:Point,b:Point,net:&str,obstacles:&[RouteObstacle],skeleton:&[(Arc<str>,Segment)],clearance:f32,layer:Option<&str>)->f32 {
 weighted_path_cost(a,b,net,obstacles,skeleton,clearance,layer,&[])
}

fn weighted_path_cost(a:Point,b:Point,net:&str,obstacles:&[RouteObstacle],skeleton:&[(Arc<str>,Segment)],clearance:f32,layer:Option<&str>,explicit:&[crate::model::ExplicitConnection])->f32 {
    let mut plan=Plan::default(); let root=plan.path(a,b,net,obstacles,skeleton,clearance,layer,explicit); plan.root(root); plan.cpu()
}

fn distance(a: Point, b: Point) -> f32 {
    crate::numerics::hypot(a.x - b.x,a.y - b.y)
}
pub(crate) fn hits(a: Point, b: Point, q: Box2) -> bool {
    arithmetic::hits(arithmetic::P{x:a.x,y:a.y},arithmetic::P{x:b.x,y:b.y},q.left,q.right,q.top,q.bottom)
}

pub(crate) fn candidate_plan(candidate:&Primitive,placed:&[&Primitive],obstacles:&[RouteObstacle],external:&[Arc<str>],ignored:&[Arc<str>],clearance:f32,bounds:Box2,relations:&[crate::model::Relation])->Plan {
    let mut plan=Plan::default();
    let root=candidate_penalty_inner(&mut plan,candidate,placed,obstacles,external,ignored,clearance,bounds,false,relations);
    plan.root(root); plan
}
pub(crate) fn board_plan(candidate:&Primitive,placed:&[&Primitive],obstacles:&[RouteObstacle],added:&[RouteObstacle],clearance:f32,bounds:Box2,relations:&[crate::model::Relation])->Plan {
    let mut plan=Plan::default();
    let root=candidate_penalty_inner(&mut plan,candidate,placed,obstacles,&[],&[],clearance,bounds,true,relations);
    plan.root(root);
    let root=added_obstacle_plan(&mut plan,placed,obstacles,added,clearance,relations);
    plan.root(root); plan
}
pub fn added_obstacle_penalty(placed:&[&Primitive],all:&[RouteObstacle],added:&[RouteObstacle],clearance:f32,relations:&[crate::model::Relation])->f32 {
    let mut plan=Plan::default(); let root=added_obstacle_plan(&mut plan,placed,all,added,clearance,relations); plan.root(root); plan.cpu()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn segment_box_handles_vertical_and_inside() {
        let q = Box2 {
            left: 0.,
            right: 1.,
            top: 0.,
            bottom: 1.,
        };
        assert!(hits(Point { x: 0.5, y: -1. }, Point { x: 0.5, y: 2. }, q));
        assert!(!hits(Point { x: 2., y: -1. }, Point { x: 2., y: 2. }, q));
        assert!(hits(Point { x: 0.5, y: 0.5 }, Point { x: 0.6, y: 0.6 }, q));
    }
    #[test]
    fn foreign_pad_cost_but_same_net_is_free() {
        let a = Point { x: 0., y: 0. };
        let b = Point { x: 10., y: 0. };
        let obstacle = RouteObstacle {
            box_: Box2 {
                left: 4.,
                right: 6.,
                top: -2.,
                bottom: 2.,
            },
            layer: None,
            reference: None,
            net: Some(Arc::from("OTHER")),
            primitive_id: None,
        };
        assert!(path_cost(a, b, "SIG", &[obstacle.clone()], &[], 0.25, None) > 0.0);
        assert_eq!(
            path_cost(a, b, "OTHER", &[obstacle.clone()], &[], 0.25, None),
            0.0
        );
        let bottom = RouteObstacle {
            layer: Some(Arc::from("bottom")),
            ..obstacle
        };
        assert_eq!(
            path_cost(a, b, "SIG", &[bottom], &[], 0.25, Some("top")),
            0.0
        );
    }
    #[test]
    fn crossing_foreign_ratline_costs_more_than_parallel() {
        let a=Point{x:0.,y:0.}; let b=Point{x:10.,y:0.};
        let crossing=vec![(Arc::from("OTHER"),(Point{x:5.,y:-5.},Point{x:5.,y:5.}))];
        let parallel=vec![(Arc::from("OTHER"),(Point{x:0.,y:5.},Point{x:10.,y:5.}))];
        assert!(path_cost(a,b,"SIG",&[],&crossing,0.25,None)>path_cost(a,b,"SIG",&[],&parallel,0.25,None));
    }
    #[test]
    fn explicit_classes_share_crossing_table_without_duplicate_multiplier() {
        let a=Point{x:0.,y:0.};let b=Point{x:10.,y:0.};
        let c=Point{x:5.,y:-5.};let d=Point{x:5.,y:5.};
        let skeleton=vec![(Arc::from("OTHER"),(c,d))];
        let path=crate::model::ExplicitConnection{source:a,target:b,net:"SIG".into(),kind:"signal_path".into(),layer:None};
        assert_eq!(weighted_path_cost(a,b,"SIG",&[],&skeleton,0.25,None,&[path.clone(),path.clone()]),9.);
        let other=crate::model::ExplicitConnection{source:c,target:d,net:"OTHER".into(),kind:"signal_path".into(),layer:None};
        assert_eq!(weighted_path_cost(a,b,"SIG",&[],&skeleton,0.25,None,&[path,other]),15.);
    }
    #[test]
    fn unrelated_new_pad_can_obstruct_an_existing_link() {
        let p: Primitive=serde_json::from_value(serde_json::json!({
            "id":"P","kind":"block","label":"P","sourceNodeId":"P","sourceNodeIds":[],
            "locked":false,"canRotate":false,"allowedOrientations":[0],
            "bbox":{"left":0,"right":10,"top":0,"bottom":1},"collisionBoxes":[],"width":10,"height":1,
            "placements":[],"connectionPoints":[{"ref":"A.1","net":"SIG","x":0,"y":0},{"ref":"B.1","net":"SIG","x":10,"y":0}]
        })).unwrap();
        let pad=RouteObstacle{box_:Box2{left:4.,right:6.,top:-2.,bottom:2.},layer:None,
            reference:Some(Arc::from("C.1")),net:Some(Arc::from("OTHER")),primitive_id:Some(Arc::from("C"))};
        assert!(added_obstacle_penalty(&[&p],&[pad.clone()],&[pad.clone()],0.25,&[])>0.);
        let same=RouteObstacle{net:Some(Arc::from("SIG")),..pad};
        assert_eq!(added_obstacle_penalty(&[&p],&[same.clone()],&[same],0.25,&[]),0.);
    }

}

/// Resolve authored pad pairs independently of the ordinary net spanning tree.
pub fn explicit_connections(primitives:&[&Primitive],relations:&[crate::model::Relation],obstacles:&[RouteObstacle])->Vec<crate::model::ExplicitConnection> {
    relations.iter().filter_map(|r| {
        let kind=if r.path_id.is_some(){"signal_path"}else if r.kind.as_ref()=="critical_pair" || r.relation.as_deref()==Some("critical_pair"){"critical_pair"}else{return None;};
        let from=r.from.strip_prefix("pad:")?;let to=r.to.strip_prefix("pad:")?;
        let find=|reference:&str|primitives.iter().flat_map(|p|p.connection_points.iter()).find(|p|p.reference.as_ref()==reference);
        let a=find(from)?;let b=find(to)?;let net=a.net.as_ref().filter(|n|!n.is_empty() && b.net.as_ref()==Some(n))?;
        Some(crate::model::ExplicitConnection{source:Point{x:a.x,y:a.y},target:Point{x:b.x,y:b.y},net:net.clone(),layer:common_layer(from,to,obstacles),kind:Arc::from(kind)})
    }).collect()
}
