//! Footprint-derived row access. Standard process: 0.127 track, 0.254 copper
//! clearance, 0.6 via land. No implicit via-in-pad. This is a congestion proxy,
//! not a router or proof that a complete fanout can be manufactured.
use crate::geometry::{Box2, Point};
#[cfg(feature = "gpu")]
use cubecl::prelude::*;
use serde::{Deserialize, Serialize};
const CLEARANCE: f32 = 0.254;
const TRACK: f32 = 0.127 + 2.0 * CLEARANCE;
const VIA: f32 = 0.6 + 2.0 * CLEARANCE;
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Row {
    #[serde(rename = "box")]
    pub box_: Box2,
    pub weight: f32,
}
#[derive(Deserialize)]
pub struct Pad {
    #[serde(rename = "box")]
    pub box_: Box2,
    pub net: Option<String>,
    #[serde(default)]
    pub through: bool,
}
#[derive(Deserialize)]
pub struct Request {
    pub role: String,
    pub body: Box2,
    pub pads: Vec<Pad>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub minimum_extra: f32,
    pub rows: Vec<Row>,
}
fn center(b: Box2) -> Point {
    Point {
        x: (b.left + b.right) * 0.5,
        y: (b.top + b.bottom) * 0.5,
    }
}
/// One conservative rectangle per perimeter row; all row pins contribute.
pub fn profile(r: &Request) -> Result<Profile, String> {
    if !crate::geometry::is_finite_box(&r.body)
        || r.pads
            .iter()
            .any(|p| !crate::geometry::is_finite_box(&p.box_))
    {
        return Err("invalid access geometry".into());
    }
    let eligible = r.role == "main_ic"
        || r.role == "connector"
        || (r.pads.len() >= 8
            && !matches!(r.role.as_str(), "passive" | "decoupling_cap" | "crystal"));
    let mut result = Profile {
        minimum_extra: if eligible { 0.1 } else { 0.0 },
        rows: vec![],
    };
    if !eligible || r.pads.is_empty() {
        return Ok(result);
    }
    let bounds = r.body;
    let c = center(bounds);
    let mut sides: [Vec<usize>; 4] = Default::default();
    for (i, p) in r.pads.iter().enumerate() {
        if p.through || p.net.as_ref().is_none_or(|s| s.is_empty()) {
            continue;
        }
        let q = center(p.box_);
        let x = (q.x - c.x) / ((bounds.right - bounds.left) * 0.5).max(0.001);
        let y = (q.y - c.y) / ((bounds.bottom - bounds.top) * 0.5).max(0.001);
        // Exposed central copper blocks inward via sites, but is not an extra row pin.
        if x.abs() < 0.35 && y.abs() < 0.35 {
            continue;
        }
        let side = if x.abs() > y.abs() {
            if x < 0.0 {
                0
            } else {
                1
            }
        } else if y < 0.0 {
            2
        } else {
            3
        };
        sides[side].push(i);
    }
    let mut reserved: Vec<(Point, Option<String>)> = Vec::new();
    for (side, ids) in sides.iter_mut().enumerate() {
        if ids.is_empty() {
            continue;
        }
        ids.sort_by(|a, b| {
            let a = center(r.pads[*a].box_);
            let b = center(r.pads[*b].box_);
            if side < 2 {
                a.y.total_cmp(&b.y)
            } else {
                a.x.total_cmp(&b.x)
            }
        });
        let mut demand = 0.0;
        let mut blocked_inside = 0.0;
        for (n, &id) in ids.iter().enumerate() {
            let p = &r.pads[id];
            let b = p.box_;
            let mut deficit = 0.0f32;
            for other in [
                n.checked_sub(1),
                if n + 1 < ids.len() { Some(n + 1) } else { None },
            ]
            .into_iter()
            .flatten()
            {
                let q = &r.pads[ids[other]];
                if p.net == q.net {
                    continue;
                }
                let gap = if side < 2 {
                    (b.top - q.box_.bottom).max(q.box_.top - b.bottom)
                } else {
                    (b.left - q.box_.right).max(q.box_.left - b.right)
                };
                deficit = deficit.max((1.0 - gap.max(0.0) / TRACK).clamp(0.0, 1.0));
            }
            demand += deficit;
            let mid = center(b);
            let mut point = mid;
            let d = 0.3 + CLEARANCE + crate::geometry_policy::DISTANCE_EPSILON_MM;
            match side {
                0 => point.x = b.right + d,
                1 => point.x = b.left - d,
                2 => point.y = b.bottom + d,
                _ => point.y = b.top - d,
            };
            // Inward candidate must fit between all copper/holes. Same-net copper still
            // forbids overlap with the solder land (via-in-pad has not been enabled).
            let free = r.pads.iter().all(|q| {
                let margin = if p.net == q.net { 0.3 } else { 0.3 + CLEARANCE };
                let q = q.box_;
                crate::geometry_policy::overlap(point.x,point.x,point.y,point.y,
                    q.left,q.right,q.top,q.bottom,margin)==0.0
            });
            // Independent slots are not enough: adjacent pins cannot claim
            // overlapping via lands. Reserve deterministic inward sites jointly.
            let free = free
                && reserved.iter().all(|(q, net)| {
                    let spacing = 0.6 + if *net == p.net { 0.0 } else { CLEARANCE };
                    let dx = point.x - q.x;
                    let dy = point.y - q.y;
                    crate::geometry_policy::violation(spacing-crate::numerics::hypot(dx,dy))==0.0
                });
            if !free {
                blocked_inside += deficit;
            } else if deficit > 0.0 {
                reserved.push((point, p.net.clone()));
            }
        }
        if demand <= 0.0 {
            continue;
        }
        let depth = TRACK + (VIA - TRACK) * (blocked_inside / demand);
        let mut b =
            crate::geometry::union_boxes(&ids.iter().map(|i| r.pads[*i].box_).collect::<Vec<_>>());
        match side {
            0 => {
                b.right = b.left;
                b.left -= depth
            }
            1 => {
                b.left = b.right;
                b.right += depth
            }
            2 => {
                b.bottom = b.top;
                b.top -= depth
            }
            _ => {
                b.top = b.bottom;
                b.bottom += depth
            }
        };
        result.rows.push(Row {
            box_: b,
            weight: 180.0 * demand,
        });
    }
    Ok(result)
}
#[cfg_attr(feature = "gpu", cube)]
pub fn obstruction(
    l: f32,
    r: f32,
    t: f32,
    b: f32,
    al: f32,
    ar: f32,
    at: f32,
    ab: f32,
    weight: f32,
) -> f32 {
    let mut left = l;
    if al > left {
        left = al;
    }
    let mut right = r;
    if ar < right {
        right = ar;
    }
    let mut top = t;
    if at > top {
        top = at;
    }
    let mut bottom = b;
    if ab < bottom {
        bottom = ab;
    }
    let mut result = 0.0;
    if right > left && bottom > top && r > l && b > t {
        result = ((right - left) * (bottom - top) / ((r - l) * (b - t))) * weight;
    }
    result
}
pub fn cost(rows: &[Row], body: Box2) -> f32 {
    rows.iter()
        .map(|q| {
            let b = q.box_;
            obstruction(
                b.left,
                b.right,
                b.top,
                b.bottom,
                body.left,
                body.right,
                body.top,
                body.bottom,
                q.weight,
            )
        })
        .sum()
}
pub fn translate(rows: &[Row], x: f32, y: f32) -> Vec<Row> {
    rows.iter()
        .map(|r| Row {
            box_: Box2 {
                left: r.box_.left + x,
                right: r.box_.right + x,
                top: r.box_.top + y,
                bottom: r.box_.bottom + y,
            },
            weight: r.weight,
        })
        .collect()
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Component {
    pub body: Box2,
    pub layer: String,
    pub rows: Vec<Row>,
}
pub fn score(cs: &[Component]) -> f32 {
    let mut total = 0.0;
    for (i, a) in cs.iter().enumerate() {
        for (j, b) in cs.iter().enumerate() {
            if i != j && a.layer == b.layer {
                total += cost(&a.rows, b.body);
            }
        }
    }
    total
}

pub fn valid(rows: &[Row]) -> bool {
    rows.len() <= 4
        && rows.iter().all(|r| {
            crate::geometry::is_finite_box(&r.box_) && r.weight.is_finite() && r.weight >= 0.0
        })
}
#[cfg(test)]
mod tests {
    use super::*;
    fn request(pitch: f32, n: usize) -> Request {
        Request {
            role: "main_ic".into(),
            body: Box2 {
                left: -6.0,
                right: 6.0,
                top: -2.0,
                bottom: 2.0,
            },
            pads: (0..n)
                .map(|i| {
                    let x = (i as f32 - (n - 1) as f32 * 0.5) * pitch;
                    Pad {
                        box_: Box2 {
                            left: x - 0.14,
                            right: x + 0.14,
                            top: -2.3,
                            bottom: -1.7,
                        },
                        net: Some(format!("N{i}")),
                        through: false,
                    }
                })
                .collect(),
        }
    }
    #[test]
    fn dense_row_counts_every_pin_but_sparse_rows_only_need_assembly_floor() {
        let dense = profile(&request(0.5, 8)).unwrap();
        let sparse = profile(&request(1.2, 8)).unwrap();
        assert_eq!(dense.rows.len(), 1);
        assert!(sparse.rows.is_empty());
        assert_eq!(sparse.minimum_extra, 0.1);
        let small = profile(&request(0.5, 4)).unwrap();
        assert!((dense.rows[0].weight / small.rows[0].weight - 2.0).abs() < 0.001);
    }
    #[test]
    fn connector_not_exempt_and_central_copper_blocks_inward_vias() {
        let mut r = request(0.5, 8);
        r.role = "connector".into();
        let before = profile(&r).unwrap();
        assert!(!before.rows.is_empty());
        r.pads.push(Pad {
            box_: Box2 {
                left: -2.0,
                right: 2.0,
                top: -1.1,
                bottom: 1.1,
            },
            net: Some("GND".into()),
            through: false,
        });
        let after = profile(&r).unwrap();
        assert_eq!(after.rows.len(), 1);
        assert!(after.rows[0].box_.top < before.rows[0].box_.top);
        assert_eq!(after.rows[0].weight, before.rows[0].weight);
    }
    #[test]
    fn obstruction_tracks_fraction_of_row_not_one_available_pin() {
        let rows = vec![Row {
            box_: Box2 {
                left: 0.0,
                right: 8.0,
                top: 0.0,
                bottom: 1.0,
            },
            weight: 1440.0,
        }];
        assert_eq!(
            cost(
                &rows,
                Box2 {
                    left: 0.0,
                    right: 1.0,
                    top: 0.0,
                    bottom: 1.0
                }
            ),
            180.0
        );
        assert_eq!(cost(&rows, rows[0].box_), 1440.0);
        assert_eq!(
            cost(
                &rows,
                Box2 {
                    left: 0.0,
                    right: 8.0,
                    top: 1.1,
                    bottom: 2.0
                }
            ),
            0.0
        );
    }
}
