import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { Color, LinearFilter, NoColorSpace } from 'three';
import type { OceanConfig } from './hi3d-types';

const vertexShader = /* glsl */`
  varying vec2 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */`
  uniform sampler2D uCoast;
  uniform float uExtent;
  uniform float uDistanceRange;
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uMid;
  uniform vec3 uShallow;
  varying vec2 vWorld;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 s = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1.,0.)), s.x),
               mix(hash(i+vec2(0.,1.)), hash(i+vec2(1.,1.)), s.x), s.y);
  }
  // Wide, broken brushstrokes rather than a field of flashing particles.
  float wave(vec2 p, float t) {
    vec2 drift = p+vec2(t*.025,-t*.12);
    drift.x += floor(drift.y/1.8)*.93;
    vec2 cell = floor(drift/vec2(2.7,1.8));
    vec2 local = mod(drift,vec2(2.7,1.8))-vec2(1.35,.9);
    float seed = hash(cell);
    local -= vec2((hash(cell+3.1)-.5)*.7,(hash(cell+7.8)-.5)*.8);
    float length = mix(.32,.78,seed);
    float bend = .13*(1.0-pow(local.x/length,2.0)) + sin(local.x*3.0+t*.5+seed*6.0)*.035;
    float crest = 1.0-smoothstep(.017,.065,abs(local.y-bend));
    float ends = 1.0-smoothstep(length*.55,length,abs(local.x));
    return crest*ends*smoothstep(.15,.4,seed)*(.75+.25*sin(t*.4+seed*6.0));
  }
  void main() {
    vec2 p = vWorld;
    vec2 uv = clamp(p/uExtent+.5, vec2(.001), vec2(.999));
    vec4 coast = texture2D(uCoast, uv);
    float distance = ((coast.r*65280.0+coast.g*255.0)/65535.0*2.0-1.0)*uDistanceRange;
    float t = uTime;
    float broad = noise(p*.18+vec2(t*.012,-t*.008));
    float wash = noise(p*.48+vec2(-t*.025,t*.017));
    vec3 sea = mix(uDeep, uMid, .28+broad*.38+wash*.1);
    float shallows = 1.0-smoothstep(-.15, 2.5+wash*.5, distance);
    sea = mix(sea, uShallow, shallows*.88);

    // The RG distance field follows the real mesh's waterline in world space.
    float edgeWobble = (noise(p*3.0+vec2(t*.11,-t*.08))-.5)*.11;
    float shore = 1.0-smoothstep(.055,.24,abs(distance+edgeWobble-.04));
    float travel = fract((distance+edgeWobble-t*.15)/1.12);
    float surf = (1.0-smoothstep(.025,.105,abs(travel-.5)))
      * smoothstep(.18,.48,distance) * (1.0-smoothstep(.8,2.5,distance));
    float gaps = smoothstep(.18,.62,noise(p*1.6+vec2(t*.035,t*.02)));
    vec3 foam = vec3(.84,.95,.85);
    sea = mix(sea,foam,shore*(.45+gaps*.25));
    sea = mix(sea,foam,surf*(.15+gaps*.42));

    vec2 direction = vec2(p.x*.86-p.y*.51, p.x*.51+p.y*.86);
    float openWaves = wave(direction,t) * smoothstep(.85,3.3,distance);
    sea = mix(sea, vec3(.63,.87,.83), openWaves*.35);
    // Soft patches give the sea a painted look without texture downloads.
    sea *= .98 + noise(p*1.4+vec2(t*.018,0.))*.035;
    gl_FragColor = vec4(sea,1.0);
    #include <colorspace_fragment>
  }
`;

export default function Ocean({config,motion}:{config:OceanConfig;motion:boolean}) {
  const coast = useTexture(config.coastMap);
  const uniforms = useMemo(()=>{
    coast.colorSpace=NoColorSpace;
    coast.minFilter=LinearFilter;
    coast.magFilter=LinearFilter;
    coast.generateMipmaps=false;
    coast.needsUpdate=true;
    return {
      uCoast:{value:coast},uExtent:{value:config.extent},
      uDistanceRange:{value:config.distanceRange},uTime:{value:0},
      uDeep:{value:new Color(config.deepColor)},uMid:{value:new Color(config.midColor)},
      uShallow:{value:new Color(config.shallowColor)}
    };
  },[coast,config]);
  useFrame((_,delta)=>{
    // A simulation clock keeps the paused phase intact, including after tab sleep.
    if(motion&&!document.hidden)uniforms.uTime.value+=Math.min(delta,.05)*config.speed;
  });
  return <mesh name="ocean" rotation={[-Math.PI/2,0,0]} position={[0,config.waterLevel,0]}>
    <planeGeometry args={[180,180]}/>
    <shaderMaterial uniforms={uniforms} vertexShader={vertexShader} fragmentShader={fragmentShader} toneMapped={false}/>
  </mesh>;
}
