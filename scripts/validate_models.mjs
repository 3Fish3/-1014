import validator from 'gltf-validator';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const output=process.env.OUTPUT_DIR || 'docs';
mkdirSync(output,{recursive:true});
const results={};
for(const name of ['hero_robot_clean','hero_robot_inferred','hero_robot_step_aligned','diff_car_teaching']){
 const report=await validator.validateBytes(new Uint8Array(readFileSync(`web/models/${name}.glb`)));
 results[name]=report.issues;
}
writeFileSync(`${output}/gltf-validation.json`,JSON.stringify(results,null,2));
if(Object.values(results).some(result=>result.numErrors))process.exitCode=1;
console.log(Object.fromEntries(Object.entries(results).map(([key,result])=>[key,{errors:result.numErrors,warnings:result.numWarnings}])));
