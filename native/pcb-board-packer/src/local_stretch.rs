//! Shared block/PostPlace CPU and CubeCL passive-pin stretch term.
#[cfg(feature = "gpu")]
use cubecl::prelude::*;

#[cfg_attr(feature = "gpu", cube)]
pub fn penalty(distance: f32, weight: f32) -> f32 {
    let mut excess = distance - 3.0;
    if excess < 0.0 { excess = 0.0; }
    weight * (6.0 * distance + 32.0 * (excess * excess))
}

#[cfg(test)]
mod tests {
    #[test]
    fn preserves_block_weights_and_knee() {
        assert_eq!(super::penalty(2.0, 1.0), 12.0);
        assert_eq!(super::penalty(3.0, 1.0), 18.0);
        assert_eq!(super::penalty(5.0, 1.0), 158.0);
        assert_eq!(super::penalty(5.0, 0.25), 39.5);
    }
}
