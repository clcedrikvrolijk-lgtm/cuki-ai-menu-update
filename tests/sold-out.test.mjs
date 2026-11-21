import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';

const player=fs.readFileSync('releases/v1.3.13/renderer.mjs','utf8');
const source=player.slice(player.indexOf('function isLiveSoldOut('), player.indexOf('async function pollPos('));
let hidden=true;
const sandbox={liveSoldOut:true,current:0,automaticSlide:false,el:()=>({classList:{toggle:(_,value)=>hidden=value}})};
vm.createContext(sandbox);
vm.runInContext(source,sandbox);
const data={_source:'live',all_sold_out:true,menu_status:'published',products:[{available:false}]};

test('only confirmed nonempty live sold out catalog activates screen',()=>{
  assert.equal(sandbox.isLiveSoldOut(data),true);
  for(const change of [{_source:'saved'},{all_sold_out:false},{products:[]},{products:[{available:true}]},{menu_status:'not_published'}])
    assert.equal(sandbox.isLiveSoldOut({...data,...change}),false);
});
test('manual Pay.aw is accessible and automatic promotions cannot hide sold-out',()=>{
  sandbox.current=0;sandbox.renderSoldOut();assert.equal(hidden,false);
  sandbox.current=2;sandbox.automaticSlide=false;sandbox.renderSoldOut();assert.equal(hidden,true);
  sandbox.automaticSlide=true;sandbox.renderSoldOut();assert.equal(hidden,false);
  sandbox.liveSoldOut=false;sandbox.renderSoldOut();assert.equal(hidden,true);
});
test('READY retains higher priority and stock polling remains independent',()=>{
  const css=fs.readFileSync('releases/v1.3.13/style.css','utf8');
  assert.match(css,/\.ready-callout\{\s*position:absolute;z-index:140/);
  assert.match(css,/\.sold-out-screen\{position:absolute;z-index:80/);
  assert.match(player,/setInterval\(pollPos,5000\)/);
  assert.match(player,/setInterval\(pollReadyOrders,5000\)/);
});
