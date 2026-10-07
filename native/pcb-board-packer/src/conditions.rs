//! Non-distance placement hints. Geometry is compiled once; CPU and CubeCL
//! share the cost and violation arithmetic. Missing external targets defer a hint.
use std::{collections::BTreeMap, sync::Arc};
use serde::{Deserialize, Serialize};
use crate::{geometry::{Box2, Point, box_corners}, model::{Primitive, Relation, ConnectionPoint}, group_endpoints::Groups};
#[cfg(feature="gpu")] use cubecl::prelude::*;

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct Spec {
    #[serde(default)] pub all: bool,
    pub edge: Option<String>,
    pub layer: Option<String>,
    pub orientation: Option<String>,
}
pub fn applies(r: &Relation) -> bool {
    matches!(r.relation.as_deref().unwrap_or(&r.kind), "away_from"|"clearance"|"same_side"|"prefer_layer"|"edge")
}
pub type Component<'a> = (&'a Arc<str>, &'a Arc<str>, &'a Arc<str>, &'a Arc<str>, Box2);
fn reference(name: &str, corner: usize) -> Arc<str> { format!("@hint:{name}:{corner}").into() }
pub fn attach(primitives: &mut [Primitive], relations: &[Relation], components: &[Component<'_>]) {
    if !relations.iter().any(applies) { return; }
    for (name, owner, _, _, b) in components {
        let Some(p) = primitives.iter_mut().find(|p| &p.id == *owner) else { continue };
        for (i, q) in box_corners(b).iter().enumerate() {
            let reference = reference(name, i);
            if let Some(cp) = Arc::make_mut(&mut p.connection_points).iter_mut().find(|cp| cp.reference == reference) { cp.x=q.x; cp.y=q.y; }
            else {
                Arc::make_mut(&mut p.connection_points).push(ConnectionPoint {x:q.x,y:q.y,reference,net:None});
                if !p.connection_point_layers.is_empty() { Arc::make_mut(&mut p.connection_point_layers).push(Arc::from("multi")); }
            }
        }
    }
}
#[derive(Clone)] pub enum Ref { Moving(u32, usize), Fixed(Point) }
#[derive(Clone, Default)] pub struct Target { pub points: Vec<Ref>, pub layers: u32 }
#[derive(Clone)] pub struct Term { pub kind:u32, pub a:Target, pub b:Target, pub weight:f32, pub minimum:f32, pub maximum:f32, pub hard:bool }
pub type Plan = Vec<Term>;
pub fn layer_mask(layer:&str)->u32 { if layer=="top" {1} else if layer=="bottom" {2} else {0} }

pub fn plan(primitives:&[Primitive], relations:&[Relation], groups:&Groups, components:&[Component<'_>], board:Option<Box2>, edge_clearance:f32)->Plan {
    let ids:BTreeMap<_,_> = primitives.iter().map(|p|p.id.clone()).collect::<std::collections::BTreeSet<_>>()
        .into_iter().enumerate().map(|(i,id)|(id,i as u32)).collect();
    let members = |endpoint:&str| -> Vec<usize> {
        components.iter().enumerate().filter_map(|(i,(name,_,block,_,_))| {
            let included = if let Some(names)=groups.get(endpoint) { names.contains(name) }
            else if let Some(b)=endpoint.strip_prefix("block:") { block.as_ref()==b }
            else { endpoint.strip_prefix("component:").or_else(||endpoint.strip_prefix("pad:").and_then(|s|s.split_once('.').map(|v|v.0))) == Some(name.as_ref()) };
            included.then_some(i)
        }).collect()
    };
    let component_target = |members:&[usize]| -> Target {
        let mut t=Target::default();
        for &i in members {
            let (name,owner,_,layer,_)=components[i];
            let Some(p)=primitives.iter().find(|p| &p.id==owner) else { return Target::default() };
            t.layers |= layer_mask(layer);
            for j in 0..4 { let Some(index)=p.connection_points.iter().position(|q|q.reference==reference(name,j)) else {return Target::default()};
                t.points.push(Ref::Moving(ids[owner],index)); }
        } t
    };
    let target = |endpoint:&str| -> Target {
        if let Some(pin)=endpoint.strip_prefix("pad:") {
            for p in primitives { if let Some(i)=p.connection_points.iter().position(|q|q.reference.as_ref()==pin) {
                return Target{points:vec![Ref::Moving(ids[&p.id],i)],layers:component_target(&members(endpoint)).layers};
            }} return Target::default();
        }
        if let (Some(anchor),Some(b))=(endpoint.strip_prefix("anchor:"),board) {
            let x=if anchor.contains("left"){b.left}else if anchor.contains("right"){b.right}else{(b.left+b.right)/2.0};
            let y=if anchor.contains("top"){b.top}else if anchor.contains("bottom"){b.bottom}else{(b.top+b.bottom)/2.0};
            return Target{points:vec![Ref::Fixed(Point{x,y})],layers:0};
        }
        component_target(&members(endpoint))
    };
    let mut result=Vec::new();
    for r in relations.iter().filter(|r|applies(r) && r.effect.as_ref()!="lock") {
        let name=r.relation.as_deref().unwrap_or(&r.kind);let default=Spec::default();let spec=r.condition.as_ref().unwrap_or(&default);
        let a=target(&r.from);if a.points.is_empty(){continue;}
        let minimum=r.min_distance.unwrap_or(if matches!(r.priority.as_deref(),Some("high"|"critical")){12.0}else{8.0});
        let weight=r.weight.unwrap_or_else(||crate::relation_score::priority_scale(r.priority.as_deref().unwrap_or("normal")).1);
        let (kind, b, maximum) = match name {
            "same_side" => (1,target(&r.to),-1.0),
            "prefer_layer" => (2,Target{points:vec![Ref::Fixed(Point{x:0.0,y:0.0})],layers:layer_mask(spec.layer.as_deref().unwrap_or(""))},-1.0),
            "edge" => { let Some(board)=board else {continue}; let Some(edge)=spec.edge.as_deref() else {continue};
                let kind=match edge{"left"=>3,"right"=>4,"top"=>5,"bottom"=>6,_=>continue};
                (kind,Target{points:box_corners(&board).into_iter().map(Ref::Fixed).collect(),layers:0},edge_clearance+0.5) },
            _ => (0,target(&r.to),-1.0),
        };
        if kind==0 && spec.all {
            let own=members(&r.from);
            for i in 0..components.len() {if !own.contains(&i) {result.push(Term{kind,a:a.clone(),b:component_target(&[i]),weight,minimum,maximum,hard:r.hard});}}
        } else if !b.points.is_empty() {result.push(Term{kind,a,b,weight,minimum,maximum,hard:r.hard});}
    } result
}

#[cfg_attr(feature="gpu", cube)]
pub fn clearance_gap(al:f32,ar:f32,at:f32,ab:f32,bl:f32,br:f32,bt:f32,bb:f32)->f32 {
    (bl-ar).max(al-br).max((bt-ab).max(at-bb))
}
#[cfg_attr(feature="gpu", cube)]
pub fn clearance_cost(gap:f32,minimum:f32,weight:f32)->f32 {let d=(minimum-gap).max(0.0); d*d*weight*20.0}
#[cfg_attr(feature="gpu", cube)]
pub fn layer_cost(a:u32,b:u32,weight:f32,same:bool)->f32 {
    let mut cost=0.0;
    if a!=0 && b!=0 && (a!=b || a==3 || b==3) {let mut scale=10.0;if same{scale=20.0;}cost=weight*scale;}cost
}
#[cfg_attr(feature="gpu", cube)]
pub fn measure(kind:u32,al:f32,ar:f32,at:f32,ab:f32,bl:f32,br:f32,bt:f32,bb:f32)->f32 {
    let mut d=0.0;
    if kind==0{d=clearance_gap(al,ar,at,ab,bl,br,bt,bb);}
    if kind==3{d=(al-bl).abs();}if kind==4{d=(br-ar).abs();}if kind==5{d=(at-bt).abs();}if kind==6{d=(bb-ab).abs();}d
}
#[cfg_attr(feature="gpu", cube)]
pub fn cost(kind:u32,d:f32,a:u32,b:u32,weight:f32,minimum:f32)->f32 {
    let mut result=d*weight;
    if kind==0{result=clearance_cost(d,minimum,weight);}if kind==1 || kind==2{result=layer_cost(a,b,weight,kind==1);}result
}
#[cfg_attr(feature="gpu", cube)]
pub fn violation(kind:u32,d:f32,minimum:f32,maximum:f32)->f32 {
    let mut result=0.0;if kind==0{result=(minimum-d).max(0.0);}if kind>=3{result=(d-maximum).max(0.0);}crate::geometry_policy::violation(result)
}
#[derive(Default)] pub struct Evaluation {pub score:f32,pub hard:usize,pub severity:f32}
pub fn evaluate(plan:&Plan,point:impl Fn(u32,usize)->Option<Point>)->Evaluation {
    let bounds=|t:&Target|->Option<Box2>{let points:Option<Vec<_>>=t.points.iter().map(|p|match p{Ref::Moving(o,i)=>point(*o,*i),Ref::Fixed(p)=>Some(*p)}).collect();
        let points=points?;if points.is_empty(){return None;}Some(Box2{left:points.iter().map(|p|p.x).fold(f32::INFINITY,f32::min),right:points.iter().map(|p|p.x).fold(f32::NEG_INFINITY,f32::max),top:points.iter().map(|p|p.y).fold(f32::INFINITY,f32::min),bottom:points.iter().map(|p|p.y).fold(f32::NEG_INFINITY,f32::max)})};
    let mut e=Evaluation::default();for t in plan {let (Some(a),Some(b))=(bounds(&t.a),bounds(&t.b)) else{continue};
        let d=measure(t.kind,a.left,a.right,a.top,a.bottom,b.left,b.right,b.top,b.bottom);
        e.score+=cost(t.kind,d,t.a.layers,t.b.layers,t.weight,t.minimum);
        if t.hard {let v=violation(t.kind,d,t.minimum,t.maximum);e.hard+=usize::from(v>0.0);e.severity+=v;}
    }e
}

/// Shared binary layout for both GPU adapters. Target: mask,count,(owner,index)*.
/// Fixed point indices refer to the float buffer; moving indices to connection points.
#[cfg(feature="gpu")]
pub fn pack(plan:&Plan,ints:&mut Vec<u32>,floats:&mut Vec<f32>)->u32 {
    fn target(t:&Target,i:&mut Vec<u32>,f:&mut Vec<f32>)->u32 {
        let start=i.len() as u32;i.extend([t.layers,t.points.len() as u32]);for p in &t.points {match p {
            Ref::Moving(owner,index)=>i.extend([*owner,*index as u32]),
            Ref::Fixed(p)=>{i.extend([u32::MAX,f.len() as u32]);f.extend([p.x,p.y]);}
        }}start
    }
    let start=ints.len();ints.push(plan.len() as u32);ints.resize(ints.len()+plan.len()*5,0);
    for (j,t) in plan.iter().enumerate(){let a=target(&t.a,ints,floats);let b=target(&t.b,ints,floats);let f=floats.len() as u32;floats.extend([t.weight,t.minimum,t.maximum]);
        ints[start+1+j*5..start+6+j*5].copy_from_slice(&[t.kind,a,b,f,u32::from(t.hard)]);}
    start as u32
}

/// Derived hint corners are geometry carriers, never electrical endpoints.
pub fn connection_count(p:&Primitive)->usize {p.connection_points.iter().filter(|q|!q.reference.starts_with("@hint:")).count()}
