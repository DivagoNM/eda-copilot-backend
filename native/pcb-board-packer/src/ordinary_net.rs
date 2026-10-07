use crate::model::{Primitive, Relation};
use std::collections::{BTreeMap};
use rustc_hash::{FxHashMap}; 
#[cfg(feature = "gpu")]
use cubecl::prelude::*;

pub const MARKER_PREFIX: &str = "__ordinary_net__:";
pub const ORDINARY_NET_SCALE: f32 = 0.5;
pub const ORDINARY_PAIR_AFFINITY_CAP: f32 = 4.0;
pub const ORDINARY_DISTANCE_KNEE_MM: f32 = 40.0;
pub const ORDINARY_DISTANCE_TAIL_SLOPE: f32 = 0.25;
pub const ORDINARY_MAX_FANOUT: usize = 8;

#[derive(Default)]
pub struct PairPlan {
    pub a: usize,
    pub b: usize,
    pub weight: f32,
    pub nets: Vec<NetLink>,
}

pub struct NetLink {
    pub a_points: Vec<usize>,
    pub b_points: Vec<usize>,
    pub weight: f32,
}

/// The distance never saturates. Keep the curve in shared CPU/CubeCL arithmetic.
#[cfg_attr(feature = "gpu", cube)]
pub fn distance_cost(distance: f32) -> f32 {
    let mut cost = distance;
    if distance > ORDINARY_DISTANCE_KNEE_MM {
        cost = ORDINARY_DISTANCE_KNEE_MM
            + (distance - ORDINARY_DISTANCE_KNEE_MM) * ORDINARY_DISTANCE_TAIL_SLOPE;
    }
    cost
}

/// Every net contributes; the total pulling strength of a bus remains bounded.
#[cfg_attr(feature = "gpu", cube)]
pub fn pair_cost(weighted_distance: f32, weight: f32) -> f32 {
    let mut scale = 1.0;
    if weight > ORDINARY_PAIR_AFFINITY_CAP {
        scale = ORDINARY_PAIR_AFFINITY_CAP / weight;
    }
    weighted_distance * scale * ORDINARY_NET_SCALE
}

pub fn markers(relations: &[Relation]) -> BTreeMap<&str, f32> {
    relations
        .iter()
        .filter_map(|relation| {
            let net = relation.from.strip_prefix(MARKER_PREFIX)?;
            if relation.to.as_ref() != relation.from.as_ref() {
                return None;
            }
            let weight = relation.weight.unwrap_or(1.0);
            (weight.is_finite() && weight > 0.0).then_some((net, weight))
        })
        .collect()
}

/// CPU and both GPU encoders share eligibility, fanout normalization and order.
pub fn pair_plan(nets: impl IntoIterator<Item = (f32, Vec<(usize, Vec<usize>)>)>) -> Vec<PairPlan> {
    let mut pairs: FxHashMap<(usize, usize), PairPlan> = FxHashMap::default();
    for (net_weight, by_primitive) in nets {
        let count = by_primitive.len();
        if count < 2 || count > ORDINARY_MAX_FANOUT {
            continue;
        }
        let contribution = net_weight / (count as f32 - 1.0);
        for a in 0..count {
            for b in (a + 1)..count {
                let key = (by_primitive[a].0, by_primitive[b].0);
                let entry = pairs.entry(key).or_insert_with(|| PairPlan {
                    a: key.0, b: key.1, ..Default::default()
                });
                entry.weight += contribution;
                entry.nets.push(NetLink {
                    a_points: by_primitive[a].1.clone(),
                    b_points: by_primitive[b].1.clone(),
                    weight: contribution,
                });
            }
        }
    }

    // Deterministic FxHashMap iteration is shared with GPU ordered reductions.
    pairs.into_values().collect()
}

pub fn plan(primitives: &[&Primitive], relations: &[Relation]) -> Vec<PairPlan> {
    pair_plan(markers(relations).into_iter().map(|(net, weight)| {
        let members = primitives.iter().enumerate().filter_map(|(i, p)| {
            let points: Vec<_> = p.connection_points.iter().enumerate()
                .filter_map(|(j, point)| (point.net.as_deref() == Some(net)).then_some(j)).collect();
            (!points.is_empty()).then_some((i, points))
        }).collect();
        (weight, members)
    }))
}

/// Weak connectivity, separate from authored placement constraints and routing.
pub fn penalty(primitives: &[&Primitive], relations: &[Relation]) -> f32 {
    plan(primitives, relations).iter().map(|pair| {
        let mut weighted_distance = 0.0;
        for net in &pair.nets {
            let mut shortest = f32::INFINITY;
            for &a in &net.a_points { for &b in &net.b_points {
                let left = &primitives[pair.a].connection_points[a];
                let right = &primitives[pair.b].connection_points[b];
                shortest = shortest.min(crate::numerics::hypot(left.x - right.x, left.y - right.y));
            }}
            weighted_distance += distance_cost(shortest) * net.weight;
        }
        pair_cost(weighted_distance, pair.weight)
    }).sum()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::geometry::Box2;
    use crate::model::{ConnectionPoint, Placement};
    use std::sync::Arc;

    fn primitive(id: &str, x: f32, nets: &[&str]) -> Primitive {
        Primitive {
            id: Arc::from(id),
            kind: Arc::from("block"),
            label: Arc::from(id),
            source_node_id: Arc::from(id),
            source_node_ids: Arc::new(vec![Arc::from(id)]),
            locked: false,
            can_rotate: false,
            allowed_orientations: Arc::new(vec![0]),
            bbox: Box2 { left: x - 0.5, right: x + 0.5, top: -0.5, bottom: 0.5 },
            collision_boxes: Arc::new(vec![]),
            collision_box_layers: Arc::new(vec![]),
            width: 1.0,
            height: 1.0,
            placements: Arc::new(vec![Placement {
                designator: Arc::from(id), x, y: 0.0, rotate: 0, layer: Arc::from("top"), score: 0.0,
            }]),
            connection_points: Arc::new(nets.iter().enumerate().map(|(index, net)| ConnectionPoint {
                x,
                y: index as f32 * 0.1,
                reference: Arc::from(format!("{id}.{}", index + 1)),
                net: Some(Arc::from(*net)),
            }).collect()),
            connection_point_layers: Arc::new(vec![]),
            path_ports: Arc::new(vec![]),
            edge_place: None,
        }
    }

    fn marker(net: &str, weight: f32) -> Relation {
        Relation {
            core: false,
            id: Arc::from(format!("{MARKER_PREFIX}{net}")),
            kind: Arc::from("net"),
            from: Arc::from(format!("{MARKER_PREFIX}{net}")),
            to: Arc::from(format!("{MARKER_PREFIX}{net}")),
            relation: None,
            priority: None,
            hard: false,
            weight: Some(weight),
            effect: Arc::from("score_only"),
            max_distance: None,
            min_distance: None,
            satellite_anchor: false,
            anchor_offset: None,
            side_preference: None,
            path_id: None,
            path_shape: None,
            prefer_facing_pads: false,
        }
    }

    #[test]
    fn normal_net_prefers_near_over_far() {
        let near_a = primitive("A", 0.0, &["SIG"]);
        let near_b = primitive("B", 2.0, &["SIG"]);
        let far_b = primitive("B", 10.0, &["SIG"]);
        let relation = marker("SIG", 1.0);
        assert!(penalty(&[&near_a, &near_b], &[relation.clone()]) < penalty(&[&near_a, &far_b], &[relation]));
    }

    #[test]
    fn short_net_cannot_hide_long_net_and_pad_order_does_not_matter() {
        let a = primitive("A", 0.0, &["SHORT", "LONG"]);
        let mut b = primitive("B", 2.0, &["SHORT", "LONG"]);
        let relations = [marker("SHORT", 1.0), marker("LONG", 1.0)];
        Arc::make_mut(&mut b.connection_points)[1].x = 20.0;
        assert_eq!(penalty(&[&a, &b], &relations), 11.0);
        Arc::make_mut(&mut b.connection_points)[1].x = 30.0;
        assert_eq!(penalty(&[&a, &b], &relations), 16.0);
        Arc::make_mut(&mut b.connection_points).reverse();
        assert_eq!(penalty(&[&a, &b], &relations), 16.0);
    }

    #[test]
    fn power_and_fanout_weights_apply_to_each_net_before_pair_cap() {
        let a = primitive("A", 0.0, &["SIG", "3V3"]);
        let mut b = primitive("B", 2.0, &["SIG", "3V3"]);
        Arc::make_mut(&mut b.connection_points)[1].x = 20.0;
        assert_eq!(penalty(&[&a, &b], &[marker("SIG", 1.0), marker("3V3", 0.1)]), 2.0);
        let c = primitive("C", 10.0, &["SIG"]);
        // Fanout three: each of the three pair distances gets weight 1/2.
        assert_eq!(penalty(&[&a, &b, &c], &[marker("SIG", 1.0)]), 5.0);
    }

    #[test]
    fn every_net_still_contributes_after_bus_strength_cap() {
        let nets = ["N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8"];
        let a = primitive("A", 0.0, &nets);
        let mut b = primitive("B", 10.0, &nets);
        let relations: Vec<_> = nets.iter().map(|net| marker(net, 1.0)).collect();
        assert_eq!(penalty(&[&a, &b], &relations), 20.0);
        Arc::make_mut(&mut b.connection_points)[7].x = 30.0;
        assert_eq!(penalty(&[&a, &b], &relations), 25.0);
    }

    #[test]
    fn distance_keeps_growing_past_thirty_and_forty() {
        let a = primitive("A", 0.0, &["SIG"]);
        let score = |d| penalty(&[&a, &primitive("B", d, &["SIG"])], &[marker("SIG", 1.0)]);
        assert_eq!(score(30.0), 15.0);
        assert_eq!(score(40.0), 20.0);
        assert_eq!(score(80.0), 20.0 + 20.0 * ORDINARY_DISTANCE_TAIL_SLOPE);
        assert!(score(81.0) > score(80.0));
        assert!(score(40.01) > score(40.0));
    }

    #[test]
    fn power_is_ten_times_weaker_than_signal() {
        let a = primitive("A", 0.0, &["SIG", "3V3"]);
        let b = primitive("B", 10.0, &["SIG", "3V3"]);
        let normal = penalty(&[&a, &b], &[marker("SIG", 1.0)]);
        let power = penalty(&[&a, &b], &[marker("3V3", 0.1)]);
        assert!((power * 10.0 - normal).abs() < 1e-9);
    }

    #[test]
    fn absent_marker_contributes_nothing() {
        let a = primitive("A", 0.0, &["GND"]);
        let b = primitive("B", 10.0, &["GND"]);
        assert_eq!(penalty(&[&a, &b], &[]), 0.0);
    }

    #[test]
    fn fanout_above_eight_is_ignored() {
        let primitives: Vec<_> = (0..9).map(|index| primitive(&format!("P{index}"), index as f32, &["BUS"])).collect();
        let refs: Vec<_> = primitives.iter().collect();
        assert_eq!(penalty(&refs, &[marker("BUS", 1.0)]), 0.0);
    }

    #[test]
    fn parallel_nets_are_capped_at_four() {
        let nets: Vec<String> = (0..20).map(|index| format!("D{index}" )).collect();
        let net_refs: Vec<_> = nets.iter().map(String::as_str).collect();
        let a = primitive("A", 0.0, &net_refs);
        let b = primitive("B", 10.0, &net_refs);
        let markers: Vec<_> = net_refs.iter().map(|net| marker(net, 1.0)).collect();
        assert!((penalty(&[&a, &b], &markers) - 20.0).abs() < 1e-9);
    }
}
