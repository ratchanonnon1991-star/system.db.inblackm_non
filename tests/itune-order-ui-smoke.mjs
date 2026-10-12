// Local, isolated UI fixtures: no sign-in, production site or database access.
// Run after both production builds. Override ORDERS_PROJECT_DIR if not siblings.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const require=createRequire(import.meta.url);
const {webpack}=require("next/dist/compiled/webpack/webpack");
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const orders=process.env.ORDERS_PROJECT_DIR || path.resolve(root,"../topup-inblackm");
const output=await mkdtemp(path.join(tmpdir(),"itune-order-ui-"));
await new Promise((resolve,reject)=>{
  const compiler=webpack({mode:"development",devtool:false,entry:path.join(root,"tests/ui/itune-order-preview.jsx"),
    output:{path:output,filename:"preview.js"},
    resolve:{alias:{"@orders-panel":path.join(orders,"src/components/admin/AdminItuneUsagePanel.js"),"@":path.join(root,"src"),react:path.join(root,"node_modules/react"),"react-dom":path.join(root,"node_modules/react-dom")},extensions:[".js",".jsx"]},
    module:{rules:[{test:/\.jsx?$/,exclude:/node_modules/,use:path.join(root,"tests/ui/jsx-loader.cjs")}]},
  });
  compiler.run((err,stats)=>compiler.close(()=>err ? reject(err) : stats.hasErrors() ? reject(new Error(stats.toString({all:false,errors:true}))) : resolve()));
});
async function cssFiles(dir) {
  const result=[];
  for(const entry of await readdir(dir,{withFileTypes:true})) {
    const target=path.join(dir,entry.name);
    if(entry.isDirectory()) result.push(...await cssFiles(target));
    else if(entry.name.endsWith(".css")) result.push(await readFile(target,"utf8"));
  }
  return result;
}
const css=[...await cssFiles(path.join(root,".next/static")),...await cssFiles(path.join(orders,".next/static"))].join("\n");
assert.ok(css.includes("min-h-11"),"requires generated production CSS");
const bundle=await readFile(path.join(output,"preview.js"));
const server=createServer((req,res)=>{
  if(req.url==="/preview.js") {res.setHeader("Content-Type","text/javascript");res.end(bundle);}
  else if(req.url==="/style.css") {res.setHeader("Content-Type","text/css");res.end(css);}
  else {res.setHeader("Content-Type","text/html");res.end('<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><body class="bg-surface text-text"><div id="root"></div><script src="/preview.js"></script></body></html>');}
});
await new Promise((resolve)=>server.listen(0,"127.0.0.1",resolve));
const browser=await chromium.launch({channel:"chrome",headless:true});
try {
  for(const width of [375,1440]) for(const dark of [false,true]) {
    const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:"reduce"});
    const errors=[];page.on("pageerror",(err)=>errors.push(err.message));
    let history=[];
    const email=`${"very-long-".repeat(8)}@example.com`;
    await page.route("**/api/**",async(route)=>{
      const url=new URL(route.request().url());
      let result;
      if(url.pathname.endsWith("/itune")) {
        if(route.request().method()==="POST") {
          const body=route.request().postDataJSON();
          if(body.action==="plan") history.unshift({id:body.id,email,currency:"USD",status:"planned",claimSessionId:"555",createdAt:new Date().toISOString()});
          if(body.action==="confirm") Object.assign(history[0],{status:"completed",usedAmount:Number(body.usedAmount)});
          if(body.action==="cancel") history[0].status="cancelled";
          result={ok:true};
        } else result={entries:[{id:12,email,currency:"USD",amount:100,claimSessionId:"555",recommended:true}],history,canManage:true,canCancel:true,externalUserId:"worker"};
      } else if(url.pathname.endsWith("/order-accounts")) result={accounts:[{externalUserId:"worker",username:"test-worker",userId:7}]};
      else result={history:[]};
      await route.fulfill({json:result});
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate((isDark)=>{
      document.documentElement.classList.toggle("dark",isDark);
      document.documentElement.dataset.theme=isDark?"dark":"light";
    },dark);
    await page.getByRole("combobox").selectOption("12");
    await page.getByRole("button",{name:"เลือกเตรียมใช้"}).click();
    await page.getByPlaceholder("เช่น 9.99").fill("9.99");
    await page.screenshot({path:path.join(output,`plan-${width}-${dark?"dark":"light"}.png`),fullPage:true});
    page.on("dialog",(dialog)=>dialog.accept());
    await page.getByRole("button",{name:"ยืนยันใช้จริง",exact:true}).click();
    await page.getByText("ใช้จริงแล้ว",{exact:false}).waitFor();
    assert.equal(history.length,1);assert.equal(history[0].usedAmount,9.99);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}/${dark}`);
    if(dark) assert.equal(await page.locator("main").evaluate((el)=>getComputedStyle(el).color),"rgb(247, 248, 248)");
    await page.getByRole("button",{name:"โหลดเมลใหม่"}).focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    assert.ok(await page.getByRole("button",{name:"โหลดเมลใหม่"}).evaluate((el)=>el===document.activeElement && getComputedStyle(el).outlineStyle!=="none"));
    await page.screenshot({path:path.join(output,`orders-${width}-${dark?"dark":"light"}.png`),fullPage:true});
    assert.deepEqual(errors,[]);
    await page.close();
  }
  console.log(`4 UI scenarios passed; screenshots: ${output}`);
} finally {await browser.close();await new Promise((resolve)=>server.close(resolve));}
