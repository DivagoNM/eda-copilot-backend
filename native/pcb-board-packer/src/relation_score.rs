//! Canonical soft relation profile and CPU/CubeCL distance objective.
//! Mechanical/hard admissibility is intentionally independent of this cost.
#[cfg(feature = "gpu")]
use cubecl::prelude::*;
use serde::{Deserialize, Serialize};

#[cfg_attr(feature = "gpu", cube)]
pub fn excess_cost(excess: f32, weight: f32, inverse_tau_squared: f32) -> f32 {
    let mut e = excess;
    if e < 0.0 {
        e = 0.0;
    }
    ((e * e) * e) * inverse_tau_squared * weight
}

#[cfg_attr(feature = "gpu", cube)]
pub fn distance_cost(
    d: f32,
    weight: f32,
    minimum: f32,
    maximum: f32,
    inverse_tau_squared: f32,
) -> f32 {
    let mut result = d * weight;
    if maximum >= 0.0 {
        result += excess_cost(d - maximum, weight, inverse_tau_squared);
    }
    if minimum >= 0.0 {
        result += excess_cost(minimum - d, weight, inverse_tau_squared);
    }
    result
}

/// Shared topology terms; geometry extraction remains specific to each stage.
#[cfg_attr(feature = "gpu", cube)]
pub fn topology_cost(
    detour: f32,
    backtrack: f32,
    turns: f32,
    facing: f32,
    detour_weight: f32,
    turn_weight: f32,
    weight: f32,
) -> f32 {
    (detour * detour_weight + backtrack * 42.0 + turns * turn_weight + facing * 12.0) * weight
}

pub fn default_path_weight() -> f32 {
    1.0
}

pub fn default_inverse_tau_squared() -> f32 {
    0.25
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Request {
    pub relation: String,
    pub priority: String,
    pub weight: Option<f32>,
    pub min_distance: Option<f32>,
    pub max_distance: Option<f32>,
    #[serde(default)]
    pub path: bool,
    #[serde(default)]
    pub core: bool,
    #[serde(default)]
    pub hard: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub weight: f32,
    pub inverse_tau_squared: f32,
    pub topology_weight: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max: Option<f32>,
}

pub fn priority_scale(priority: &str) -> (f32, f32) {
    match priority {
        "critical" => (4.0, 240.0),
        "high" => (2.0, 140.0),
        "low" => (0.5, 25.0),
        _ => (1.0, 70.0),
    }
}

pub fn profile(r: &Request) -> Profile {
    resolve_profile(
        &r.relation,
        &r.priority,
        r.weight,
        r.min_distance,
        r.max_distance,
        r.path,
        r.core,
        r.hard,
    )
}

fn resolve_profile(
    relation: &str,
    priority_name: &str,
    weight: Option<f32>,
    min_distance: Option<f32>,
    max_distance: Option<f32>,
    path: bool,
    core: bool,
    hard: bool,
) -> Profile {
    let (priority, encoded) = priority_scale(priority_name);
    let pair = relation == "critical_pair";
    let max = max_distance.or_else(|| match relation {
        "near" => Some(if matches!(priority_name, "critical" | "high") {
            8.0
        } else {
            12.0
        }),
        "very_near" => Some(if priority_name == "critical" {
            3.0
        } else {
            4.0
        }),
        "cluster_with" => Some(10.0),
        "critical_pair" if !path => Some(if core || priority_name == "critical" {
            3.0
        } else {
            4.0
        }),
        _ => None,
    });
    let min = min_distance.or_else(|| match relation {
        "very_near" => Some(0.4),
        "near" | "cluster_with" => Some(0.8),
        _ => None,
    });
    let topology_weight =
        priority * (weight.unwrap_or(encoded) / encoded) * if path { 2.0 } else { 1.0 };
    Profile {
        weight: 10.0 * topology_weight,
        topology_weight,
        // Core hard distance allows drift, with a stronger excess cost only.
        inverse_tau_squared: (if pair || path { 1.0 } else { 0.25 })
            * if core && hard { 100.0 } else { 1.0 },
        min,
        max,
    }
}

pub fn for_relation(r: &crate::model::Relation) -> Profile {
    resolve_profile(
        if r.kind.as_ref() == "critical_pair" {
            "critical_pair"
        } else {
            r.relation.as_deref().unwrap_or(r.kind.as_ref())
        },
        r.priority.as_deref().unwrap_or("normal"),
        r.weight,
        r.min_distance,
        r.max_distance,
        r.path_id.is_some(),
        r.core,
        r.hard,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn agreed_curve_and_no_cap() {
        assert_eq!(distance_cost(9.0, 40.0, -1.0, 9.0, 1.0), 360.0);
        assert_eq!(distance_cost(9.5, 40.0, -1.0, 9.0, 1.0), 385.0);
        assert_eq!(distance_cost(17.0, 40.0, -1.0, 9.0, 1.0), 21160.0);
        assert_eq!(distance_cost(9.5, 80.0, -1.0, 9.0, 1.0), 770.0);
        assert!(distance_cost(40.0, 40.0, -1.0, 9.0, 1.0) > 250000.0);
    }
    #[test]
    fn preserve_defaults_without_priority_squared() {
        let r = Request {
            relation: "near".into(),
            priority: "critical".into(),
            weight: Some(240.0),
            min_distance: None,
            max_distance: None,
            path: false,
            core: false,
            hard: false,
        };
        let p = profile(&r);
        assert_eq!(p.weight, 40.0);
        assert_eq!(p.max, Some(8.0));
        assert_eq!(p.min, Some(0.8));
        let p = profile(&Request {
            relation: "critical_pair".into(),
            path: true,
            ..r
        });
        assert_eq!(p.max, None);
        assert_eq!(p.weight, 80.0);
    }
}

/// 0 ordinary, 1 authored critical pair, 2 authored signal path.
#[cfg_attr(feature = "gpu", cube)]
pub fn crossing_factor(a: u32, b: u32) -> f32 {
    let sum = a + b;
    let mut value=1.0; if sum == 1 {value=2.0;} if sum == 2 {value=3.0;} if sum == 3 {value=4.0;} if sum >= 4 {value=5.0;} value
}
#[cfg_attr(feature = "gpu", cube)]
pub fn pad_factor(class: u32) -> f32 { let mut value=1.0; if class == 1 {value=2.0;} if class >= 2 {value=3.0;} value }
pub fn connection_class(kind: &str) -> u32 { match kind { "signal_path" => 2, "critical_pair" => 1, _ => 0 } }

#[cfg_attr(feature = "gpu", cube)]
pub fn crossing_weight(weight: f32, class: u32) -> f32 {
    let mut result=weight;if class>0 {result=1.0;} result
}
