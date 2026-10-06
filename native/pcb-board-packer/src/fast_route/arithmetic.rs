//! The same ordered F32 path arithmetic is compiled for Rust and CubeCL.
#[cfg(feature = "gpu")]
use cubecl::prelude::*;

#[derive(Clone, Copy)]
#[cfg_attr(feature = "gpu", derive(CubeType))]
pub struct P { pub x: f32, pub y: f32 }
#[derive(Clone, Copy)]
#[cfg_attr(feature = "gpu", derive(CubeType))]
pub struct Path { pub a: P, pub b: P, pub c: P, pub d: P, pub count: u32 }

#[cfg_attr(feature = "gpu", cube)]
pub fn point(p: Path, i: u32) -> P {
    let mut q = p.a;
    if i == 1 { q.x = p.b.x; q.y = p.b.y; }
    if i == 2 { q.x = p.c.x; q.y = p.c.y; }
    if i == 3 { q.x = p.d.x; q.y = p.d.y; }
    q
}
#[cfg_attr(feature = "gpu", cube)]
pub fn orient(a: P, b: P, c: P) -> f32 {
    (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)
}
#[cfg_attr(feature = "gpu", cube)]
pub fn crosses(a: P, b: P, c: P, d: P) -> bool {
    orient(a,b,c)*orient(a,b,d) < -1e-9 && orient(c,d,a)*orient(c,d,b) < -1e-9
}
#[cfg_attr(feature = "gpu", cube)]
pub fn hits(a: P, b: P, l: f32, r: f32, t: f32, bottom: f32) -> bool {
    let mut lo = 0.0f32;
    let mut hi = 1.0f32;
    let mut valid = true;
    for axis in 0..2u32 {
        let mut start = a.x; let mut delta = b.x-a.x; let mut min = l; let mut max = r;
        if axis == 1 { start = a.y; delta = b.y-a.y; min = t; max = bottom; }
        if delta.abs() < 1e-9 {
            if start < min || start > max { valid = false; }
        } else {
            let t1 = (min-start)/delta; let t2 = (max-start)/delta;
            let low = if t1 < t2 { t1 } else { t2 };
            let high = if t1 > t2 { t1 } else { t2 };
            if low > lo { lo = low; } if high < hi { hi = high; }
            if lo > hi { valid = false; }
        }
    }
    valid
}
#[cfg_attr(feature = "gpu", cube)]
pub fn obstacle(p: Path, l: f32, r: f32, t: f32, b: f32, clearance: f32, pad_factor: f32) -> f32 {
    let mut direct = false; let mut band = false;
    for i in 0..p.count-1 {
        let a = point(p,i); let z = point(p,i+1);
        if hits(a,z,l,r,t,b) { direct = true; }
    }
    if !direct {
        for i in 0..p.count-1 {
            if hits(point(p,i),point(p,i+1),l-clearance,r+clearance,t-clearance,b+clearance) { band = true; }
        }
    }
    let mut cost = 0.0;
    if direct { cost = 20.0*pad_factor; } else if band { cost = 2.0; }
    cost
}
#[cfg_attr(feature = "gpu", cube)]
pub fn crossing(p: Path, a: P, b: P, factor: f32) -> f32 {
    let mut hit = false;
    for i in 0..p.count-1 { if crosses(point(p,i),point(p,i+1),a,b) { hit = true; } }
    let mut cost = 0.0;
    if hit { cost = 3.0*factor; }
    cost
}
