//! Authored groups use member geometry, not the containing rigid body's center.
use std::{collections::{BTreeMap, BTreeSet}, sync::Arc};
use crate::{geometry::{box_center, union_boxes, Box2}, model::{Primitive, Relation, ConnectionPoint}};

pub type Groups = BTreeMap<Arc<str>, Vec<Arc<str>>>;

pub fn attach(
    primitives: &mut [Primitive], relations: &[Relation], groups: &Groups,
    components: &[(&Arc<str>, &Arc<str>, &Arc<str>, Box2)],
) -> Result<(), String> {
    let endpoints: BTreeSet<_> = relations.iter().flat_map(|r| [&r.from, &r.to])
        .filter(|e| e.starts_with("block:") || e.starts_with("module:")).cloned().collect();
    for endpoint in endpoints {
        let members: Vec<_> = components.iter().filter(|(designator, _, block, _)| {
            if let Some(names) = groups.get(&endpoint) { names.contains(designator) }
            else { endpoint.strip_prefix("block:").is_some_and(|name| block.as_ref() == name) }
        }).collect();
        // External groups are legitimate in a local solve. Legacy captures without
        // membership retain tree resolution; never invent a point for an absent group.
        let Some(first) = members.first() else { continue; };
        if members.iter().any(|c| c.1 != first.1) {
            return Err(format!("relation {endpoint} spans multiple rigid primitives"));
        }
        let point = box_center(&union_boxes(&members.iter().map(|c| c.3).collect::<Vec<_>>()));
        let owner = primitives.iter_mut().find(|p| &p.id == first.1)
            .ok_or_else(|| format!("missing rigid owner for relation {endpoint}"))?;
        if let Some(existing) = Arc::make_mut(&mut owner.connection_points).iter_mut()
            .find(|p| p.reference == endpoint) {
            existing.x = point.x; existing.y = point.y;
        } else {
            Arc::make_mut(&mut owner.connection_points).push(ConnectionPoint {
                reference: endpoint, x: point.x, y: point.y, net: None,
            });
            if !owner.connection_point_layers.is_empty() {
                Arc::make_mut(&mut owner.connection_point_layers).push(Arc::from("multi"));
            }
        }
    }
    Ok(())
}
