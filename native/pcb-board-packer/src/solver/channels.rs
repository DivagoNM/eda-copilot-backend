//! Optional coordinated proposals. Ownership, geometry and acceptance stay in
//! the ordinary board solver; structural similarity alone never implies adjacency.
use super::*;

#[derive(Clone)]
struct Target {
    index: usize,
    owner: u32,
    connector: Arc<str>,
    path: Arc<str>,
    order: i32,
    point: Point,
}

fn targets(state: &SearchState, index: usize) -> Vec<Target> {
    let mut result = Vec::new();
    for fixed in state.placed.iter().filter(|p| p.primitive.locked) {
        for port in fixed.primitive.path_ports.iter() {
            if let Some(local) = state.remaining[index].primitive.path_ports.iter()
                .find(|p| p.path_id == port.path_id && p.order.abs_diff(port.order) == 1) {
                result.push(Target { index, owner: fixed.id,
                    connector: port.reference.split('.').next().unwrap_or(&port.reference).into(),
                    path: local.path_id.clone(), order: local.order,
                    point: Point { x: port.x, y: port.y } });
            }
        }
    }
    result
}

pub(super) fn proposals(state: &SearchState, next: usize, context: &Context) -> Vec<Vec<WorkingPrimitive>> {
    let Some(policy) = &context.problem.soft_alignment else { return vec![]; };
    let id = &state.remaining[next].primitive.id;
    let peers: Vec<_> = policy.pairs.iter().filter(|p| p.similarity >= 0.85)
        .filter_map(|p| if &p.a == id { Some(&p.b) } else if &p.b == id { Some(&p.a) } else { None })
        .filter_map(|id| state.remaining.iter().position(|p| &p.primitive.id == id)).collect();
    let mut proposals = Vec::new();
    for anchor in targets(state, next) {
        let mut group = vec![anchor.clone()];
        for &index in &peers {
            if let Some(target) = targets(state, index).into_iter().find(|t|
                t.owner == anchor.owner && t.connector == anchor.connector && t.path != anchor.path) {
                if !group.iter().any(|t| t.index == index || t.path == target.path) { group.push(target); }
            }
        }
        if group.len() < 2 { continue; }
        // Bounded lookahead: nearest channels to the current target. The pair
        // subset remains available if a complete row cannot fit.
        group[1..].sort_by(|a,b| {
            let distance = |t: &Target| (t.point.x-anchor.point.x).abs()+(t.point.y-anchor.point.y).abs();
            compare_f32(distance(a),distance(b)).then(a.index.cmp(&b.index))
        });
        group.truncate(16);
        let counts = if group.len() > 2 { vec![2, group.len()] } else { vec![2] };
        for count in counts {
            let mut members = group[..count].to_vec();
            let xs: Vec<_> = members.iter().map(|t| t.point.x).collect();
            let ys: Vec<_> = members.iter().map(|t| t.point.y).collect();
            let range = |v: &[f32]| v.iter().copied().fold(f32::NEG_INFINITY,f32::max)-v.iter().copied().fold(f32::INFINITY,f32::min);
            let horizontal = range(&xs) >= range(&ys);
            let along = |p: Point| if horizontal { p.x } else { p.y };
            members.sort_by(|a,b| compare_f32(along(a.point),along(b.point)).then(a.index.cmp(&b.index)));
            let connector = state.placed.iter().find(|p| p.id == anchor.owner).unwrap();
            let cb = packing_box(connector);
            // Match anchor-component orientation, including the existing authored
            // offset, instead of assuming identical source primitive rotations.
            for first in orientation_variants(&state.remaining[next]) {
                let variants: Option<Vec<_>> = members.iter().map(|t| {
                    if t.index == next { return Some(first.clone()); }
                    let peer = &state.remaining[t.index];
                    let pair = policy.pairs.iter().find(|p|
                        (&p.a == id && p.b == peer.primitive.id) || (&p.b == id && p.a == peer.primitive.id))?;
                    orientation_variants(peer).into_iter().min_by(|a,b| {
                        let error = |p: &WorkingPrimitive| {
                            if let Some(o) = &pair.orientation {
                                let (a,b) = if pair.a == *id { (&first,p) } else { (p,&first) };
                                if let (Some(a),Some(b)) = (a.primitive.placements.iter().find(|p|p.designator==o.a),b.primitive.placements.iter().find(|p|p.designator==o.b)) {
                                    return 1.0-crate::rotation::cos_degrees(a.rotate as f32-b.rotate as f32-o.offset);
                                }
                            }
                            1.0-crate::rotation::cos_degrees((p.rotation-first.rotation) as f32)
                        };
                        compare_f32(error(a),error(b))
                    })
                }).collect();
                let Some(variants) = variants else { continue; };
                for gap in [context.problem.clearance, context.problem.clearance+1.0, context.problem.clearance+3.0] {
                    for side in [-1.0,1.0] {
                        for spread in [false,true] {
                            let mut row = variants.clone();
                            let mut previous: Option<Box2> = None;
                            for (p,t) in row.iter_mut().zip(&members) {
                                let port = p.primitive.path_ports.iter().find(|p|p.path_id==t.path && p.order==t.order).unwrap();
                                let delta = along(t.point)-along(Point{x:port.x,y:port.y});
                                let b = packing_box(p);
                                let perpendicular = if horizontal {
                                    if side < 0.0 { cb.top-gap-b.bottom } else { cb.bottom+gap-b.top }
                                } else if side < 0.0 { cb.left-gap-b.right } else { cb.right+gap-b.left };
                                translate_primitive(p,if horizontal {delta}else{perpendicular},if horizontal {perpendicular}else{delta});
                                if spread {
                                    if let Some(prev) = previous {
                                        let b = packing_box(p);
                                        let shift = if horizontal {(prev.right+gap-b.left).max(0.0)} else {(prev.bottom+gap-b.top).max(0.0)};
                                        translate_primitive(p,if horizontal {shift}else{0.0},if horizontal {0.0}else{shift});
                                    }
                                    previous = Some(packing_box(p));
                                }
                            }
                            // Recenter a widened row on its target pins. Try small
                            // common shifts as well; legality uses actual geometry.
                            let error = row.iter().zip(&members).map(|(p,t)| {
                                let port=p.primitive.path_ports.iter().find(|p|p.path_id==t.path && p.order==t.order).unwrap();
                                along(t.point)-along(Point{x:port.x,y:port.y})
                            }).sum::<f32>() / row.len() as f32;
                            for offset in [-1.0,0.0,1.0] {
                                let mut moved=row.clone();
                                for p in &mut moved { translate_primitive(p,if horizontal {error+offset}else{0.0},if horizontal {0.0}else{error+offset}); }
                                proposals.push(moved);
                            }
                        }
                    }
                }
            }
        }
    }
    proposals
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn large_rows_keep_pair_fallback_and_nearest_sixteen_unique_members() {
        for count in [5, 16, 17] {
            let bbox = json!({"left": -1, "right": 1, "top": -0.5, "bottom": 0.5});
            let primitives: Vec<_> = (0..=count).map(|i| json!({
                "id": format!("P{i}"), "kind": "block", "label": "channel",
                "sourceNodeId": "test", "sourceNodeIds": ["test"], "locked": i == count,
                "canRotate": true, "allowedOrientations": [0, 90, 180, 270],
                "bbox": bbox, "collisionBoxes": [bbox], "width": 2, "height": 1,
                "placements": [{"designator": format!("U{i}"), "x": 0, "y": 0,
                    "rotate": 0, "layer": "top", "score": 0}], "connectionPoints": [],
                "pathPorts": if i == count { (0..count).map(|j| json!({
                    "pathId": format!("ch{j}"), "order": 0, "ref": format!("J1.{}",j+1),
                    "role": "source", "x": j*3, "y": 0, "normal": {"x": 0, "y": 1}
                })).collect::<Vec<_>>() } else { vec![json!({
                    "pathId": format!("ch{i}"), "order": 1, "ref": format!("U{i}.1"),
                    "role": "target", "x": 0, "y": 0, "normal": {"x": 0, "y": -1}
                })] }
            })).collect();
            let bounds = json!({"left": -60, "right": 60, "top": -60, "bottom": 60});
            let problem: BoardPackProblem = serde_json::from_value(json!({
                "version": 7, "grid": 0.5, "clearance": 0.2, "searchWidth": 32,
                "compactness": "normal", "bounds": bounds, "fullBoardBounds": bounds,
                "boardOutline": [], "edgeClearance": 0.2, "primitives": primitives,
                "relations": [], "obstacles": [], "constraintRegions": [], "components": [],
                "componentPairClearance": [], "componentConflict": [],
                "softAlignment": {"weight": 1, "tolerance": 0.15, "orientationWeight": 0,
                    "pairs": (1..count).map(|i| json!({"a": "P0", "b": format!("P{i}"),
                        "anchorA": "U0", "anchorB": format!("U{i}"), "similarity": 1})).collect::<Vec<_>>()}
            })).unwrap();
            let (primitives, context) = prepare_context(problem, #[cfg(feature = "gpu")] None);
            let (placed, remaining) = primitives.into_iter().partition(|p| p.primitive.locked);
            let state = SearchState { placed, remaining, rank: Rank {hard_count: 0, hard_severity: 0.0, score: 0.0}, route_penalty: 0.0, ordinal: 0 };
            let rows = proposals(&state, 0, &context);
            assert!(rows.iter().any(|row| row.len() == 2));
            assert!(rows.iter().any(|row| row.len() == count.min(16)));
            for row in rows {
                assert!(row.len() == 2 || row.len() == count.min(16));
                let ids: BTreeSet<_> = row.iter().map(|p| p.primitive.id.as_ref()).collect();
                assert_eq!(ids.len(), row.len());
                assert!(ids.contains("P0"));
                if count == 17 { assert!(!ids.contains("P16")); }
            }
        }
    }
}

/// Retain exact score elites, then reserve the other half for different channel
/// layouts. This is soft selection, never a geometric equivalence/legality rule.
pub(super) fn select_level(groups: Vec<Vec<SearchState>>, width: usize, context: &Context) -> Vec<SearchState> {
    // Allocate the real inventory quotas first. Applying diversity at width 32
    // and then taking only 16 from each inventory would retain only its elites.
    let mut quotas=vec![0;groups.len()];
    let mut count=0;
    while count<width {
        let before=count;
        for (i,group) in groups.iter().enumerate() {
            if count==width {break;}
            if quotas[i]<group.len() {quotas[i]+=1;count+=1;}
        }
        if count==before {break;}
    }
    groups.into_iter().zip(quotas).flat_map(|(group,quota)|diverse(group,quota,context)).collect()
}

pub(super) fn diverse(mut states: Vec<SearchState>, width: usize, context: &Context) -> Vec<SearchState> {
    states.sort_by(compare_states);
    if states.len() <= width { return states; }
    let key = |state: &SearchState| {
        let peers = context.problem.soft_alignment.as_ref();
        let mut poses: Vec<_> = state.placed.iter().filter(|p| !p.primitive.locked &&
            peers.is_some_and(|s| s.pairs.iter().any(|pair|pair.similarity>=0.85 && (pair.a==p.primitive.id || pair.b==p.primitive.id))))
            .map(|p| {let c=box_center(&p.primitive.bbox);(p.id,p.rotation,(c.x/0.75).floor() as i32,(c.y/0.75).floor() as i32)}).collect();
        if poses.is_empty() {
            if let Some(p)=state.placed.last() {let c=box_center(&p.primitive.bbox);poses.push((p.id,p.rotation,(c.x/0.75).floor() as i32,(c.y/0.75).floor() as i32));}
        }
        poses.sort(); poses
    };
    let elite=width.div_ceil(2);
    let mut chosen=vec![false;states.len()];
    let mut clusters=FxHashSet::default();
    for i in 0..elite {chosen[i]=true;clusters.insert(key(&states[i]));}
    let mut count=elite;
    let best=&states[0].rank;
    for i in elite..states.len() {
        if count==width {break;}
        // Diversity never purchases new physical violations. Keep an absolute
        // soft-score window so pre-existing hard penalties cannot inflate it.
        if states[i].rank.hard_count!=best.hard_count || states[i].rank.hard_severity!=best.hard_severity || states[i].rank.score>best.score+1000.0 {continue;}
        if clusters.insert(key(&states[i])) {chosen[i]=true;count+=1;}
    }
    for selected in &mut chosen {if count==width {break;}if !*selected {*selected=true;count+=1;}}
    states.into_iter().zip(chosen).filter_map(|(s,keep)|keep.then_some(s)).collect()
}
