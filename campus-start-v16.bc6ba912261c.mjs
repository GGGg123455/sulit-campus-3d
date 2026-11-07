import * as THREE from 'three';
function shape(rs,origin=[0,0]){const s=new THREE.Shape();rs.forEach((ring,j)=>{const p=j?new THREE.Path():s;ring.forEach((q,i)=>i?p.lineTo(q[0]-origin[0],-q[1]+origin[1]):p.moveTo(q[0]-origin[0],-q[1]+origin[1]));p.closePath();if(j)s.holes.push(p);});return s;}
const mat=(name,color)=>new THREE.MeshStandardMaterial({name,color,roughness:.88});
export function buildStartupCampus(data){
 const root=new THREE.Group();root.name='complete-campus-instant-overview-v16';root.userData={startupOverview:true,buildingObjects:data.buildings.length};
 const walls=mat('Overview_Mineral','#d0cec4'),roof=mat('Overview_Roof','#a7ada8'),glass=mat('Overview_Glass','#647e81'),asphalt=mat('Overview_Asphalt','#646b68'),paving=mat('Overview_Paving','#bbbdb2'),green=mat('Overview_Turf','#748367'),water=mat('Overview_Water','#45685f');
 const add=(parent,rs,y,h,material,name,origin)=>{const geo=h?new THREE.ExtrudeGeometry(shape(rs,origin),{depth:h,bevelEnabled:false,curveSegments:2}):new THREE.ShapeGeometry(shape(rs,origin));geo.rotateX(-Math.PI/2);geo.translate(0,y,0);const n=new THREE.Mesh(geo,material);n.name=name;n.castShadow=Boolean(h>1);n.receiveShadow=true;parent.add(n);return n;};
 const grade=new THREE.Mesh(new THREE.PlaneGeometry(3300,3300),green);grade.rotation.x=-Math.PI/2;grade.position.y=-.30;grade.name='startup-reference-site-grade';root.add(grade);
 for(const [kind,rings] of Object.entries(data.roadNetwork.surfaces))for(const rs of rings)add(root,rs,kind==='asphalt'?.12:.24,0,kind==='asphalt'?asphalt:paving,'startup-'+kind);
 for(const rs of data.hydroNetwork.channels)add(root,rs,.035,0,water,'startup-water');
 for(const b of data.buildings){const g=new THREE.Group();g.name=b.id+' '+b.name;g.position.set(b.position[0],0,b.position[1]);g.userData={id:b.id,name:b.name,type:b.type};root.add(g);const H=b.displayHeight||b.estimatedHeight||6;
  for(const rs of b.openCorridor?.wingRings||[b.rings]){add(g,rs,.2,H-.4,b.type==='library'?mat('Overview_Library','#a9674c'):walls,'startup-building-body',b.position);add(g,rs,H-.2,.18,roof,'startup-building-roof',b.position);}
  for(const rs of b.openCorridor?.connectorRings||[])add(g,rs,b.openCorridor.clearHeightReference,.28,roof,'startup-one-storey-open-corridor',b.position);
 }
 for(const c of data.buildingConnections||[])if(c.rings?.length)add(root,c.rings,(c.roofTopReference??4.1)-.20,.20,roof,'startup-confirmed-connector');
 for(const a of data.athletics||[])if(a.outerRing)add(root,[a.outerRing],.22,0,mat('Overview_Track','#a25a4c'),'startup-track');
 for(const p of data.pitches)if(!['unknown','soccer'].includes(p.sport))add(root,p.rings,.258,0,mat('Overview_Court','#5a887a'),'startup-court');
 for(const gate of data.gates){const [x,z]=gate.position,[nx0,nz0]=gate.outwardAxis,L=Math.hypot(nx0,nz0),nx=nx0/L,nz=nz0/L,zz=gate.gateLineLocalZ||0;
  for(const [a,b] of gate.closedGateSpans||[]){const n=new THREE.Mesh(new THREE.BoxGeometry(b-a,1.3,.16),glass);n.position.set(x+nz*(a+b)/2+nx*zz,.78,z-nx*(a+b)/2+nz*zz);n.rotation.y=Math.atan2(nx,nz);n.name='startup-closed-retractable-gate';root.add(n);}
 }
 return root;
}
