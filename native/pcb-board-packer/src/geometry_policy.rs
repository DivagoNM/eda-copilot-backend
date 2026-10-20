//! Physical distance tolerance, shared by native CPU and CubeCL predicates.
//! Not a score tie, coordinate quantizer, sorting comparator or machine epsilon.
#[cfg(feature = "gpu")]
use cubecl::prelude::*;

pub const DISTANCE_EPSILON_MM: f32 = 0.001;

/// An outline vertex strictly inside a body proves the body covers a notch.
#[cfg_attr(feature = "gpu", cube)]
pub fn inside_box(x:f32,y:f32,l:f32,r:f32,t:f32,b:f32)->bool {
    x-l>epsilon() && r-x>epsilon() && y-t>epsilon() && b-y>epsilon()
}

#[cfg_attr(feature = "gpu", cube)]
pub fn epsilon() -> f32 {
    DISTANCE_EPSILON_MM.into()
}

/// Preserve actual severity outside the tolerance; do not discount every gap.
#[cfg_attr(feature = "gpu", cube)]
pub fn violation(depth: f32) -> f32 {
    let mut result = 0.0;
    if depth > epsilon() {
        result = depth;
    }
    result
}

/// `to - from` for two edges. Grid edges are F32 approximations of whole
/// ticks, off by up to half an ULP each, and the subtraction rounds once more,
/// so their difference depends on where the boxes are. Within that error the
/// gap is the whole tick: the same grid boxes give the same gap after any
/// translation.
#[cfg_attr(feature = "gpu", cube)]
fn edge_gap(to: f32, from: f32) -> f32 {
    let gap = to - from;
    let tick = crate::numerics::rp(gap);
    let mut result = gap;
    if (gap - tick).abs() <= (to.abs() + from.abs() + gap.abs()) * (f32::EPSILON * 0.5) {
        result = tick;
    }
    result
}

#[cfg_attr(feature = "gpu", cube)]
pub fn overlap(
    al: f32,
    ar: f32,
    at: f32,
    ab: f32,
    bl: f32,
    br: f32,
    bt: f32,
    bb: f32,
    clearance: f32,
) -> f32 {
    // Compare the gap before calculating severity: adding clearance to an
    // absolute edge can flip a boundary after centering. Allow the F32 rounding
    // of the clearance subtraction (one relative machine epsilon, not mm).
    let gap = edge_gap(bl, ar).max(edge_gap(al, br)).max(edge_gap(bt, ab).max(edge_gap(at, bb)));
    let mut result = 0.0;
    let roundoff = clearance.abs() * f32::EPSILON;
    if gap < (clearance - epsilon()) - roundoff {
        result = clearance - gap;
    }
    result
}

#[cfg_attr(feature = "gpu", cube)]
pub fn outside(l: f32, r: f32, t: f32, b: f32, bl: f32, br: f32, bt: f32, bb: f32) -> f32 {
    violation(bl - l) + violation(r - br) + violation(bt - t) + violation(b - bb)
}

/// Cross product has mm^2 units: compare to distance tolerance times length.
#[cfg_attr(feature = "gpu", cube)]
pub fn side(ax: f32, ay: f32, bx: f32, by: f32, px: f32, py: f32) -> i32 {
    let dx = bx - ax;
    let dy = by - ay;
    let cross = dx * (py - ay) - dy * (px - ax);
    let band = epsilon() * crate::numerics::hypot(dx, dy);
    let mut result = 0i32;
    if cross > band {
        result = 1;
    }
    if cross < -band {
        result = -1;
    }
    result
}

#[cfg_attr(feature = "gpu", cube)]
pub fn on_segment(px: f32, py: f32, ax: f32, ay: f32, bx: f32, by: f32) -> bool {
    side(ax, ay, bx, by, px, py) == 0
        && px >= ax.min(bx) - epsilon()
        && px <= ax.max(bx) + epsilon()
        && py >= ay.min(by) - epsilon()
        && py <= ay.max(by) + epsilon()
}

#[cfg_attr(feature = "gpu", cube)]
pub fn crosses(ax: f32, ay: f32, bx: f32, by: f32, cx: f32, cy: f32, dx: f32, dy: f32) -> bool {
    side(ax, ay, bx, by, cx, cy) * side(ax, ay, bx, by, dx, dy) < 0
        && side(cx, cy, dx, dy, ax, ay) * side(cx, cy, dx, dy, bx, by) < 0
}

#[cfg_attr(feature = "gpu", cube)]
pub fn intersects(ax: f32, ay: f32, bx: f32, by: f32, cx: f32, cy: f32, dx: f32, dy: f32) -> bool {
    crosses(ax, ay, bx, by, cx, cy, dx, dy)
        || on_segment(cx, cy, ax, ay, bx, by)
        || on_segment(dx, dy, ax, ay, bx, by)
        || on_segment(ax, ay, cx, cy, dx, dy)
        || on_segment(bx, by, cx, cy, dx, dy)
}

/// Closed pad/obstacle contact, with a distance band on the slab boundaries.
#[cfg_attr(feature = "gpu", cube)]
pub fn hits_box(ax: f32, ay: f32, bx: f32, by: f32, l: f32, r: f32, t: f32, b: f32) -> bool {
    let mut lo = 0.0f32;
    let mut hi = 1.0f32;
    let mut valid = true;
    for axis in 0..2u32 {
        let mut start = ax;
        let mut delta = bx - ax;
        let mut lower = l - epsilon();
        let mut upper = r + epsilon();
        if axis == 1 {
            start = ay;
            delta = by - ay;
            lower = t - epsilon();
            upper = b + epsilon();
        }
        // Exact zero is intentional: every representable nonzero direction is
        // clipped. A second epsilon here would add an axis-dependent dead zone.
        if delta == 0.0 {
            if start < lower || start > upper {
                valid = false;
            }
        } else {
            let t1 = (lower - start) / delta;
            let t2 = (upper - start) / delta;
            let low = if t1 < t2 { t1 } else { t2 };
            let high = if t1 > t2 { t1 } else { t2 };
            if low > lo {
                lo = low;
            }
            if high < hi {
                hi = high;
            }
            if lo > hi {
                valid = false;
            }
        }
    }
    valid
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn tolerance_has_a_closed_boundary_and_preserves_real_severity() {
        assert_eq!(epsilon(), DISTANCE_EPSILON_MM);
        for d in [-1.0, 0.0, 5.9604645e-8, 0.0005, epsilon()] {
            assert_eq!(violation(d), 0.0);
        }
        assert_eq!(violation(0.0011), 0.0011);
        assert_eq!(violation(0.02), 0.02);
    }
    #[test]
    fn clearance_survives_translation_and_axis_exchange_in_supported_frame() {
        for origin in [-1000.0, -10.0, 0.0, 10.0, 1000.0] {
            for gap in [0.2, 0.1995, 0.198] {
                let al = origin;
                let ar = origin + 1.0;
                let bl = ar + gap;
                let br = bl + 1.0;
                let x = overlap(al, ar, 0.0, 1.0, bl, br, 0.0, 1.0, 0.2);
                let y = overlap(0.0, 1.0, al, ar, 0.0, 1.0, bl, br, 0.2);
                assert_eq!(x, y);
                assert_eq!(x > 0.0, gap < 0.199);
            }
        }
    }
    #[test]
    fn usb_tolerance_boundary_is_legal_before_and_after_centering() {
        for (ar, bl) in [(2.180000067, 2.529000044), (-2.319999933, -1.970999956)] {
            assert_eq!(overlap(ar - 4.359, ar, -2.179, 2.179,
                bl, bl + 3.928, -0.679, 1.179, 0.35), 0.0);
            // A sub-tick shift beyond the F32 representation error of these edges
            // (about 3e-7 near 2.5 mm) still counts.
            assert!(overlap(ar - 4.359, ar, -2.179, 2.179,
                bl - 0.0000006, bl + 3.928, -0.679, 1.179, 0.35) > epsilon());
            let depth = overlap(ar - 4.359, ar, -2.179, 2.179,
                bl - 0.001, bl + 3.927, -0.679, 1.179, 0.35);
            assert!(depth > 0.0019 && depth < 0.0021);
        }
    }
    #[test]
    fn grid_clearance_boundary_does_not_depend_on_the_position() {
        // H743 buck_5: C23 and C24 end 0.099 mm apart with 0.1 mm clearance.
        // Centring moved them from y = -0.218 / -0.317 to -0.718 / -0.817.
        let mm = |ticks: i32| (ticks as f64 / 1000.0) as f32;
        for (top, bottom) in [(-218, -317), (-718, -817)] {
            assert_eq!(overlap(mm(-10005), mm(-7225), mm(top), mm(top + 1420),
                mm(-10005), mm(-7225), mm(bottom - 1420), mm(bottom), 0.1), 0.0);
        }
        // Grid boxes `ticks` apart give one result wherever they are placed.
        for ticks in [97, 98, 99, 100, 101] {
            let at = |origin: i32| overlap(mm(origin - 2780), mm(origin), 0.0, 1.0,
                mm(origin + ticks), mm(origin + ticks + 1420), 0.0, 1.0, 0.1);
            let expected = at(0);
            assert_eq!(expected > 0.0, ticks < 99, "{ticks} ticks");
            for origin in (-50_000..50_000).step_by(37) {
                assert_eq!(at(origin), expected, "{ticks} ticks at {origin}");
            }
        }
    }
    #[test]
    fn crossing_uses_distance_units_and_keeps_contact_separate() {
        for length in [0.1, 1.0, 100.0] {
            assert_eq!(side(0.0, 0.0, length, 0.0, length / 2.0, 0.0005), 0);
            assert_eq!(side(0.0, 0.0, length, 0.0, length / 2.0, 0.002), 1);
        }
        assert!(crosses(0.0, 0.0, 10.0, 0.0, 5.0, -1.0, 5.0, 1.0));
        assert!(!crosses(0.0, 0.0, 10.0, 0.0, 5.0, 0.0, 5.0, 1.0));
        assert!(intersects(0.0, 0.0, 10.0, 0.0, 5.0, 0.0, 5.0, 1.0));
        assert!(!on_segment(2.0, 2.0, 0.0, 0.0, 0.0, 0.0));
    }
}
