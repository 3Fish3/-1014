import validator from 'gltf-validator';
import {readFileSync,writeFileSync} from 'node:fs';
const results={};
for(const name of ['hero_robot_clean','diff_car_teaching']){
 const report=await validator.validateBytes(new Uint8Array(readFileSync(`web/models/${name}.glb`)));
 results[name]=report.issues;
}
writeFileSync('docs/gltf-validation.json',JSON.stringify(results,null,2));
if(Object.values(results).some(result=>result.numErrors))process.exitCode=1;
console.log(Object.fromEntries(Object.entries(results).map(([key,result])=>[key,{errors:result.numErrors,warnings:result.numWarnings}])));
