use super::{arithmetic::{self, P, Path}, plan::Plan};
use crate::compute::{gpu, Error, Requirements, ScratchKey};
use cubecl::prelude::*;

#[cube(launch_unchecked)]
fn evaluate(f:&Array<f32>,n:&Array<u32>,obstacles:&Array<f32>,links:&Array<f32>,out:&mut Array<f32>,count:u32) {
    let i=ABSOLUTE_POS as usize;
    if i<count as usize {
        let a=i*11; let b=i*5;
        let p=Path{a:P{x:f[a],y:f[a+1]},b:P{x:f[a+2],y:f[a+3]},c:P{x:f[a+4],y:f[a+5]},d:P{x:f[a+6],y:f[a+7]},count:n[b]};
        let mut cost=f[a+8];
        for j in n[b+1]..n[b+1]+n[b+2] {
            let o=j as usize*4;
            cost+=arithmetic::obstacle(p,obstacles[o],obstacles[o+1],obstacles[o+2],obstacles[o+3],f[a+9],f[a+10]);
        }
        for j in n[b+3]..n[b+3]+n[b+4] {
            let l=j as usize*5;
            cost+=arithmetic::crossing(p,P{x:links[l],y:links[l+1]},P{x:links[l+2],y:links[l+3]},links[l+4]);
        }
        out[i]=cost;
    }
}
impl Plan {
    pub(crate) fn gpu(&self)->Result<f32,Error> {
        let count=self.ints.len()/5;
        if count==0 {return Ok(self.reduce(&[]));}
        if std::env::var("PCB_ROUTE_GPU_FAIL").as_deref()==Ok("1") {return Err("injected geometric route failure".into());}
        // A saved nine-primitive block regressed with one GPU dispatch per tiny
        // correction. Keep small batches on the identical shared CPU evaluator.
        // Force is diagnostic-only, so parity/recovery tests exercise the kernel.
        let work=self.work();
        if work<16_384 && std::env::var("PCB_ROUTE_GPU_FORCE").as_deref()!=Ok("1") {
            if std::env::var("PCB_ROUTE_GPU_PROFILE").as_deref()==Ok("1") {
                eprintln!("[geometric-route-cpu] {}",serde_json::json!({"paths":count,"work":work,"reason":"below GPU work threshold"}));
            }
            return Ok(self.cpu());
        }
        let started=std::time::Instant::now();
        let paths=gpu::with_batch(Requirements{f32:true,u64:false},"geometric-route",count,|session| {
            let bytes=(self.floats.len()+self.ints.len()+self.obstacles.len()+self.links.len())*4;
            if session.batch_capacity(bytes,4,count)? < count { return Err("geometric route batch exceeds available GPU capacity".into()); }
            let client=session.client.clone();
            let f=client.create_from_slice(f32::as_bytes(&self.floats));
            let n=client.create_from_slice(u32::as_bytes(&self.ints));
            let obs=client.create_from_slice(f32::as_bytes(if self.obstacles.is_empty(){&[0.0]}else{&self.obstacles}));
            let links=client.create_from_slice(f32::as_bytes(if self.links.is_empty(){&[0.0]}else{&self.links}));
            let out=session.workspace(ScratchKey::new("geometric-route",0),count*4);
            crate::compute::client::with_client!(client, |c,R| {
                unsafe { evaluate::launch_unchecked::<R>(c,CubeCount::Static(count.div_ceil(128) as u32,1,1),CubeDim::new_1d(128),
                    ArrayArg::from_raw_parts(f,self.floats.len()),ArrayArg::from_raw_parts(n,self.ints.len()),
                    ArrayArg::from_raw_parts(obs,self.obstacles.len().max(1)),ArrayArg::from_raw_parts(links,self.links.len().max(1)),
                    ArrayArg::from_raw_parts(out.clone(),count),count as u32); }
            });
            let data=client.read_one(out).map_err(|e|Error::from(format!("geometric route readback: {e:?}")))?;
            Ok(f32::from_bytes(&data)[..count].to_vec())
        })?;
        if paths.iter().any(|v|!v.is_finite()) {return Err("nonfinite geometric route result".into());}
        if std::env::var("PCB_ROUTE_GPU_VERIFY").as_deref()==Ok("1") {
            let expected=self.cpu_paths();
            if let Some(i)=paths.iter().zip(&expected).position(|(a,b)|a.to_bits()!=b.to_bits()) {
                return Err(format!("geometric route parity at path {i}: GPU={} CPU={}",paths[i],expected[i]).into());
            }
        }
        if std::env::var("PCB_ROUTE_GPU_PROFILE").as_deref()==Ok("1") {
            eprintln!("[geometric-route-gpu] {}",serde_json::json!({"paths":count,"jobs":count/7,"work":work,"wallMs":started.elapsed().as_secs_f64()*1000.0}));
        }
        Ok(self.reduce(&paths))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{fast_route::*,geometry::{Point,Box2},model::RouteObstacle};
    #[test]
    #[ignore = "requires a compatible unleased GPU; run alone"]
    fn geometric_paths_match_cpu() {
        let _env=crate::float_env::Guard::enter();
        let mut plan=Plan::default();
        let obstacles:Vec<_>=(0..41).map(|i|RouteObstacle{
            box_:Box2{left:i as f32*0.37,right:i as f32*0.37+0.5,top:-1.3,bottom:2.7},
            net:Some(if i%3==0 {"SIG"}else{"OTHER"}.into()),
            layer:if i%3==0{None}else{Some(if i%2==0{"top"}else{"bottom"}.into())},
            reference:None,primitive_id:None,
        }).collect();
        let links=vec![("OTHER".into(),(Point{x:2.7,y:-5.},Point{x:3.1,y:6.}))];
        for i in 0..128 {
            let a=Point{x:i as f32*0.013,y:-0.375};
            let b=Point{x:8.75,y:i as f32*0.037};
            let explicit=vec![crate::model::ExplicitConnection{source:a,target:b,net:"SIG".into(),kind:"signal_path".into(),layer:None}];
            let cost=plan.path(a,b,"SIG",&obstacles,&links,0.25,if i%2==0{Some("top")}else{None},&explicit);
            plan.root(cost);
        }
        std::env::set_var("PCB_ROUTE_GPU_VERIFY","1");
        let gpu=plan.gpu().expect("actual GPU path evaluation");
        std::env::remove_var("PCB_ROUTE_GPU_VERIFY");
        assert_eq!(gpu.to_bits(),plan.cpu().to_bits());
        // Empty plans must not dispatch or lose constant escape expressions.
        assert_eq!(Plan::default().gpu().unwrap(),0.0);
    }
}
