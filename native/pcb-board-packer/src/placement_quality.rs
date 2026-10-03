//! Native-owned criteria previously present only in the TypeScript orchestrator.
//! Block/board objectives are NOT reproduced here: their evaluators are reused.
use crate::geometry::{Box2, Point};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IslandPoint {
    pub reference: String,
    pub owner: String,
    pub net: Option<String>,
    pub point: Point,
    pub center: Point,
    pub layer: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IslandPad {
    pub reference: String,
    pub net: Option<String>,
    #[serde(rename="box")]
    pub box_: Box2,
    pub layer: String,
    pub through_hole: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IslandQuality {
    pub core_pairs: bool,
    pub bbox: Box2,
    pub overlap: bool,
    pub points: Vec<IslandPoint>,
    pub pads: Vec<IslandPad>,
    pub pairs: Vec<[String; 2]>,
    pub max_distance: Option<f32>,
    pub power_net: Option<String>,
    pub return_net: Option<String>,
    pub center_power_bus: bool,
    pub axis: Option<String>,
    pub pin_one: Option<PinOne>,
    pub origin: Point,
}

#[derive(Deserialize)]
pub struct PinOne { pub offset: Point, pub width: f32, pub height: f32 }

fn distance(a: Point, b: Point) -> f32 { crate::numerics::hypot(a.x-b.x,a.y-b.y) }
fn normalize(p: Point) -> Point {
    let d=crate::numerics::hypot(p.x,p.y);
    if d <= 0.000001 { Point{x:0.0,y:0.0} } else {Point{x:p.x/d,y:p.y/d}}
}
fn direction(a: Point,b: Point) -> Point {normalize(Point{x:b.x-a.x,y:b.y-a.y})}
fn dot(a:Point,b:Point)->f32 {a.x*b.x+a.y*b.y}
fn extent(points: &[Point]) -> (f32,f32) {
    if points.is_empty() {return (0.0,0.0);}
    let minx=points.iter().map(|p|p.x).fold(f32::INFINITY,f32::min);
    let maxx=points.iter().map(|p|p.x).fold(f32::NEG_INFINITY,f32::max);
    let miny=points.iter().map(|p|p.y).fold(f32::INFINITY,f32::min);
    let maxy=points.iter().map(|p|p.y).fold(f32::NEG_INFINITY,f32::max);
    (maxx-minx,maxy-miny)
}
fn first_net_points(p:&IslandQuality,net:&str)->Vec<Point> {
    let mut owners=std::collections::HashSet::new();
    p.points.iter().filter(|q|q.net.as_deref()==Some(net)&&owners.insert(&q.owner)).map(|q|q.point).collect()
}
pub fn pin_one(p:&PinOne)->f32 {
    let x=p.offset.x/(p.width/2.0).max(0.001);
    let y=p.offset.y/(p.height/2.0).max(0.001);
    (x+0.25).max(0.0).powi(2)+(y+0.25).max(0.0).powi(2)+(x-y).max(0.0)*0.15
}

pub fn island(p:&IslandQuality)->f32 {
    let w=p.bbox.right-p.bbox.left; let h=p.bbox.bottom-p.bbox.top;
    let pairs:Vec<_>=p.pairs.iter().filter_map(|r|Some((
        p.points.iter().find(|q|q.reference==r[0])?,p.points.iter().find(|q|q.reference==r[1])?))).collect();
    let ds:Vec<_>=pairs.iter().map(|(a,b)|distance(a.point,b.point)).collect();
    let mut score=if p.overlap {1_000_000.0} else {0.0};
    if p.core_pairs {
        let mut pair_score=0.0;
        for d in &ds {let excess=p.max_distance.map_or(0.0,|max|(d-max).max(0.0));pair_score+=d+excess*excess*100.0;}
        score+=pair_score*10_000.0;
        let mut hits=0;
        for (a,b) in &pairs {
            let mut crossed=std::collections::HashSet::new();
            for pad in &p.pads {
                if pad.reference==a.reference||pad.reference==b.reference {continue;}
                if a.net.as_ref().is_some_and(|n|!n.is_empty()&&pad.net.as_ref()==Some(n)) {continue;}
                if a.layer==b.layer&&pad.layer!=a.layer&&!pad.through_hole {continue;}
                if crate::block_solver::segment_intersects_box(a.point,b.point,&pad.box_) {crossed.insert(&pad.reference);}
            }
            hits+=crossed.len();
        }
        score+=hits as f32*180.0*100.0;
        let positive:Vec<_>=ds.iter().copied().filter(|d|*d>0.0).collect();
        if positive.len()>=2 {score+=(positive.iter().copied().fold(0.0,f32::max)-positive.iter().copied().fold(f32::INFINITY,f32::min))*25.0;}
        let mut crossings=0;
        for i in 0..pairs.len() {for j in i+1..pairs.len() {
            if segments_cross(pairs[i].0.point,pairs[i].1.point,pairs[j].0.point,pairs[j].1.point) {crossings+=1;}
        }}
        score+=crossings as f32*600.0;
        let mut facing=0.0;
        for (a,b) in &pairs {let link=direction(a.point,b.point);
            facing+=(1.0-dot(direction(a.center,a.point),link)).max(0.0);
            facing+=(1.0+dot(direction(b.center,b.point),link)).max(0.0);
        }
        score+=facing*15.0;
        score+=w*h*0.4;
        score+=ds.iter().sum::<f32>()+ds.iter().copied().fold(0.0,f32::max);
        score+=p.pin_one.as_ref().map_or(0.0,pin_one)*5.0;
    } else {
        // Preserve the old island-only objective; it has no native block-search counterpart.
        score=w*h*2.0+(w+h)+score;
        score+=ds.iter().sum::<f32>()*8.0;
        let mut nets:Vec<&str>=vec![];
        for q in &p.points {if let Some(n)=q.net.as_deref().filter(|n|!n.is_empty()) {if !nets.contains(&n) {nets.push(n);}}}
        let mut spread=0.0;
        for net in nets {let points:Vec<_>=p.points.iter().filter(|q|q.net.as_deref()==Some(net)).map(|q|q.point).collect();
            let (x,y)=extent(&points);
            spread+=(x+y)*if net.to_ascii_uppercase().contains("GND") {0.2} else {1.0};
        }
        score+=spread*5.0;
        if let (Some(power),Some(ret))=(&p.power_net,&p.return_net) {
            let power=first_net_points(p,power);let ret=first_net_points(p,ret);
            let (px,py)=extent(&power);let (rx,ry)=extent(&ret);
            let mut alignment=px.min(py)+rx.min(ry);
            if p.center_power_bus&&!power.is_empty()&&!ret.is_empty() {
                if let Some(axis)=&p.axis {
                    let cross=|ps:&[Point]|ps.iter().map(|q|if axis=="x" {q.y-p.origin.y}else{q.x-p.origin.x}).sum::<f32>()/ps.len() as f32;
                    alignment+=(cross(&power).abs()-cross(&ret).abs()).max(0.0)*100.0;
                }
            }
            score+=alignment*6.0;
        }
    }
    score
}

fn orientation(a:Point,b:Point,c:Point)->f32 {
    let value=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
    if value.abs()<0.000001 {0.0}else{value.signum()}
}
fn segments_cross(a:Point,b:Point,c:Point,d:Point)->bool {
    orientation(a,b,c)*orientation(a,b,d)<0.0 && orientation(c,d,a)*orientation(c,d,b)<0.0
}

#[derive(Deserialize)]
#[serde(tag="kind",rename_all="camelCase")]
pub enum OrientationQuality {
    PinOne { offset:Point,width:f32,height:f32 },
    Bypass { offsets:Vec<Point>,axis:String },
    PadAxis { power:Point,ret:Point,axis:String },
    RowPower { power:Point,ret:Point,axis:String,side:f32 },
    TargetPad { offsets:Vec<Point>,axis:String },
    Initial { terms:Vec<DirectionTerm> },
}
#[derive(Deserialize)]
pub struct DirectionTerm {pub source:Point,pub target:Point,pub weight:f32}

#[derive(Deserialize)]
#[serde(tag="kind",rename_all="camelCase")]
pub enum OrientationWeight {
    External {role:String,net:String},
    Side {hard:bool,gap:Option<f32>},
}
pub fn orientation_weight(p:&OrientationWeight)->f32 {
    match p {
        OrientationWeight::External{role,net} =>
            (if role=="connector" {2.5}else if role=="main_ic" {1.3}else{1.0})
            * if crate::net_class::is_power(net) {0.25}else{1.0},
        OrientationWeight::Side{hard,gap}=>80.0*if *hard {2.0}else{1.0}*if gap.is_some_and(|g|g<=5.0) {1.4}else{1.0},
    }
}
pub fn orientation_score(p:&OrientationQuality)->f32 {
    match p {
        OrientationQuality::PinOne{offset,width,height}=>pin_one(&PinOne{offset:*offset,width:*width,height:*height}),
        OrientationQuality::Bypass{offsets,axis}=>{
            let cross:Vec<_>=offsets.iter().map(|p|if axis=="x" {p.y}else{p.x}).collect();
            let sum=cross.iter().map(|p|p.abs()).sum::<f32>();
            if !cross.iter().any(|p|*p>0.0001)||!cross.iter().any(|p|*p< -0.0001) {sum}else{sum*0.2}
        },
        OrientationQuality::PadAxis{power,ret,axis}=>{let dx=(power.x-ret.x).abs();let dy=(power.y-ret.y).abs();if axis=="x" {dx-dy}else{dy-dx}},
        OrientationQuality::RowPower{power,ret,axis,side}=>{
            if axis=="x" {power.y*side+ret.y*(-side)-(power.x-ret.x).abs()}
            else {power.x*side+ret.x*(-side)-(power.y-ret.y).abs()}
        },
        OrientationQuality::TargetPad{offsets,axis}=>if offsets.is_empty() {0.0}else{
            offsets.iter().map(|p|if axis=="x" {p.y.abs()}else{p.x.abs()}).sum::<f32>()/offsets.len() as f32},
        OrientationQuality::Initial{terms}=>terms.iter().map(|t|(1.0-dot(normalize(t.source),normalize(t.target)))*t.weight).sum(),
    }
}

#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
pub struct BlockQuality {
    pub score:f32, pub electrical:f32, pub wire:f32, pub max_local:f32,
    pub width:f32, pub height:f32, pub exposure:f32,
    pub links:std::collections::BTreeMap<String,f32>,
    pub ports:std::collections::BTreeMap<String,Point>,
}
pub fn compare_block(a:&BlockQuality,b:&BlockQuality,kind:&str)->Result<bool,String> {
    Ok(match kind {
        "comparable"=>a.electrical<=b.electrical*1.12+20.0&&a.wire<=b.wire*1.15+1.0
            &&b.links.iter().all(|(k,d)|a.links.get(k).is_some_and(|x|*x<=d+1.5f32.max(d*0.35))),
        "dominates"=>a.electrical<=b.electrical+1.0&&a.wire<=b.wire+0.05
            &&a.width<=b.width+0.1&&a.height<=b.height+0.1&&a.exposure<=b.exposure+0.1
            &&b.ports.iter().all(|(k,p)|a.ports.get(k).is_some_and(|q|distance(*p,*q)<0.5)),
        "near"=>(a.electrical-b.electrical).abs()<=0.5&&(a.score-b.score).abs()<=1.0
            &&(a.wire-b.wire).abs()<=0.1&&(a.max_local-b.max_local).abs()<=0.1
            &&a.links.len()==b.links.len()&&a.links.iter().all(|(k,d)|b.links.get(k).is_some_and(|x|(d-x).abs()<=0.1)),
        _=>return Err("unknown block comparison".into()),
    })
}

#[derive(Deserialize)]
pub struct ElectricalQuality {pub score:f32,pub lengths:Vec<f32>}
pub fn electrical_regression(before:&ElectricalQuality,after:&ElectricalQuality)->Option<&'static str> {
    if after.score>before.score+40.0f32.min(0.001*before.score.abs()) {return Some("wiring score");}
    let a=before.lengths.iter().sum::<f32>();let b=after.lengths.iter().sum::<f32>();
    if b>a+0.5f32.max(0.005*a) {return Some("total net length");}
    if before.lengths.len()!=after.lengths.len()||after.lengths.iter().zip(&before.lengths).any(|(b,a)|*b>a+0.5f32.max(0.25*a)) {return Some("individual net length");}
    None
}

#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
pub struct Similarity {
    pub nodes_a:Vec<(String,f32)>,pub nodes_b:Vec<(String,f32)>,
    pub edges_a:Vec<(String,f32)>,pub edges_b:Vec<(String,f32)>,
    pub dimensions:Option<[f32;4]>,
}
fn dice(a:&[(String,f32)],b:&[(String,f32)],weighted:bool)->f32 {
    let mut keys:Vec<&str>=a.iter().map(|(k,_)|k.as_str()).collect();
    for (k,_) in b {if !keys.contains(&k.as_str()) {keys.push(k);}}
    let mut shared=0.0;let mut total=0.0;
    for key in keys {
        let weight=if !weighted {1.0}else if key.starts_with("IC") {4.0}else if key=="L" {3.0}else{1.0};
        let av=a.iter().find(|(k,_)|k==key).map_or(0.0,|(_,v)|*v);
        let bv=b.iter().find(|(k,_)|k==key).map_or(0.0,|(_,v)|*v);
        shared+=weight*av.min(bv);total+=weight*(av+bv);
    }
    if total>0.0 {2.0*shared/total}else{1.0}
}
pub fn similarity(p:&Similarity)->f32 {
    let shape=p.dimensions.map_or(1.0,|[aw,ah,bw,bh]| {
        let (x0,x1)=(aw.min(ah),aw.max(ah));let (y0,y1)=(bw.min(bh),bw.max(bh));
        (x0.min(y0)/x0.max(y0).max(0.001))*x1.min(y1)/x1.max(y1).max(0.001)
    });
    if shape<0.5 {return 0.0;}
    0.55*dice(&p.nodes_a,&p.nodes_b,true)+0.3*dice(&p.edges_a,&p.edges_b,false)+0.15*shape
}
