import {test,expect} from '@playwright/test';

test('individual point styling, computed brackets, drag, portable roundtrip, stale protection and exports',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');
 await page.locator('.figure-item').first().click();
 await expect(page.locator('#chart-svg')).toBeVisible();
 await expect(page.locator('[data-point-id]')).toHaveCount(48);
 const first=page.locator('[data-point-id="point-1-1"]');
 await first.click();
 await page.getByRole('spinbutton',{name:'Point size',exact:true}).fill('10');
 await page.getByLabel('Point color hex',{exact:true}).fill('#ff0000');
 await expect(first.locator('circle').first()).toHaveAttribute('fill','#ff0000');
 await expect(first.locator('circle').first()).toHaveAttribute('r','10');
 await expect(page.locator('[data-point-id="point-1-2"] circle').first()).not.toHaveAttribute('fill','#ff0000');
 await page.getByRole('button',{name:'Analyze data',exact:true}).click();
 await expect(page.getByRole('button',{name:'Analyze and annotate chart'})).toBeEnabled();
 await page.getByRole('button',{name:'Analyze and annotate chart'}).click();
 await expect(page.locator('.results-card').last()).toBeVisible();
 await page.getByRole('button',{name:'View chart',exact:true}).click();
 const brackets=page.locator('[data-annotation-id]');
 expect(await brackets.count()).toBeGreaterThan(0);
 const boxes=await brackets.evaluateAll(els=>els.map(el=>{const boxes=[...el.querySelectorAll('path,text')].map(e=>(e as SVGGraphicsElement).getBBox());const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));return {x,y,w:Math.max(...boxes.map(b=>b.x+b.width))-x,h:Math.max(...boxes.map(b=>b.y+b.height))-y}}));
 for(const b of boxes){expect(b.y).toBeGreaterThan(45);expect(b.x).toBeGreaterThan(0);expect(b.x+b.w).toBeLessThan(801)}
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];expect(a.y+a.h<=b.y||b.y+b.h<=a.y||a.x+a.w<=b.x||b.x+b.w<=a.x).toBeTruthy()}
 const bracket=brackets.first(),box=await bracket.boundingBox();expect(box).not.toBeNull();
 const annotationId=await bracket.getAttribute('data-annotation-id');
 await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);await page.mouse.down();await page.mouse.move(box!.x+box!.width/2+20,box!.y+box!.height/2+12,{steps:8});await page.mouse.up();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('plotstatlab.project.v1')!));
 const c=saved.charts.find((c:any)=>c.id===saved.activeChartId);
 expect(c.annotationPositions[annotationId!].dy).toBeGreaterThan(5);
 expect(c.pointStyles['point-1-1'].color).toBe('#ff0000');
 await page.reload();await page.locator('.figure-item').first().click();await expect(page.locator('[data-point-id="point-1-1"] circle').first()).toHaveAttribute('fill','#ff0000');
 const projectDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Save workspace',exact:true}).click();const pd=await projectDownload;expect(pd.suggestedFilename()).toMatch(/\.psl$/);
 await page.locator('input[type=file]').first().setInputFiles({name:'roundtrip.labplot',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
 await expect(page.locator('[data-point-id="point-1-1"] circle').first()).toHaveAttribute('fill','#ff0000');
 await page.getByRole('button',{name:'Export',exact:true}).click();
 const svgDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Export SVG',exact:true}).click();const svg=await svgDownload;const stream=await svg.createReadStream();const chunks:Buffer[]=[];for await(const chunk of stream!)chunks.push(Buffer.from(chunk));const text=Buffer.concat(chunks).toString();expect(text).toContain('<svg');expect(text).not.toContain('data-editor-only');expect(text).toContain('#ff0000');expect(text).toContain('width="800"');
 await page.getByRole('button',{name:'Export',exact:true}).click();await page.getByRole('button',{name:/PNG Image/}).click();const pngDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Export PNG',exact:true}).click();const png=await pngDownload;const pngStream=await png.createReadStream();const pngChunks:Buffer[]=[];for await(const chunk of pngStream!)pngChunks.push(Buffer.from(chunk));const pngBytes=Buffer.concat(pngChunks);expect(pngBytes.readUInt32BE(16)).toBe(2400);expect(pngBytes.readUInt32BE(20)).toBe(1680);
 await page.getByRole('button',{name:'Data',exact:true}).last().click();
 const cell=page.getByRole('textbox',{name:'Control, row 1',exact:true});await cell.fill('28.5');await cell.press('Enter');
 await page.getByRole('button',{name:'Editor',exact:true}).click();
 await expect(page.locator('[data-annotation-id]')).toHaveCount(0);
 await expect(page.getByText('Data or options changed — rerun the analysis')).toBeVisible();
 expect(errors).toEqual([]);
});

test('all chart families render; styles transfer while individual point overrides survive',async({page})=>{
 await page.goto('/');
 await page.locator('.figure-item').first().click();
 await page.locator('[data-point-id="point-1-1"]').click();await page.getByLabel('Point color hex',{exact:true}).fill('#cc2288');
 const types=['bar','swarm','box','violin','raincloud','paired','scatter','line','histogram','density','ecdf','heatmap','bar-swarm'];
 for(const type of types){await page.getByRole('button',{name:'New chart',exact:true}).first().click();await page.getByLabel('Current chart type').selectOption(type);await expect(page.locator('#chart-svg')).toBeVisible();const invalid=await page.locator('#chart-svg').evaluate(el=>el.outerHTML.includes('NaN')||el.outerHTML.includes('Infinity'));expect(invalid,`invalid coordinates in ${type}`).toBe(false)}
 await expect(page.locator('[data-point-id="point-1-1"] circle').first()).toHaveAttribute('fill','#cc2288');
 await page.getByRole('button',{name:'Apply style',exact:true}).click();await page.getByLabel('Copy style from').selectOption({index:1});await page.getByRole('button',{name:/Apply to Treatment response/}).click();await expect(page.locator('[data-point-id="point-1-1"] circle').first()).toHaveAttribute('fill','#cc2288');
 await page.getByRole('button',{name:'Data',exact:true}).last().click();await page.getByRole('button',{name:'Delete row 1',exact:true}).click();await page.reload();await page.locator('.figure-item').first().click();await expect(page.locator('#chart-svg')).toBeVisible();await expect(page.locator('[data-point-id]')).toHaveCount(44);
});

test('multiple datasets, independent analyses and chosen panels survive a workspace file roundtrip',async({page})=>{
 await page.goto('/');
 await page.locator('input[type=file][multiple]').setInputFiles([
  {name:'Study B.csv',mimeType:'text/csv',buffer:Buffer.from('Subject,Control,Treated\ns1,1,4\ns2,2,6\ns3,3,8\ns4,2,7\ns5,4,9')},
  {name:'Study C.csv',mimeType:'text/csv',buffer:Buffer.from('Subject,Control,Treated\ns1,10,14\ns2,12,17\ns3,11,18\ns4,14,20\ns5,13,19')},
 ]);
 await expect(page.locator('.dataset-navigation>button')).toHaveCount(3);
 await page.getByRole('button',{name:'Statistics',exact:true}).last().click();
 await expect(page.getByRole('button',{name:'Analyze and annotate chart'})).toBeEnabled();
 await page.getByRole('button',{name:'Analyze and annotate chart'}).click();
 await expect(page.getByRole('button',{name:'View chart',exact:true})).toBeVisible();
 await page.locator('.dataset-navigation>button').filter({hasText:'Study C'}).click();
 await page.getByRole('button',{name:'Statistics',exact:true}).last().click();
 await page.locator('.test-option').filter({hasText:'Mann–Whitney U'}).click();
 await page.getByRole('button',{name:'Analyze and annotate chart'}).click();
 await expect(page.getByRole('button',{name:'View chart',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Overview',exact:true}).last().click();
 await expect(page.locator('.workspace-figure-card')).toHaveCount(4);
 await expect(page.locator('.workspace-analysis-card')).toHaveCount(2);
 await expect(page.locator('.workspace-analysis-card')).toContainText(['Welch t-test','Mann–Whitney U']);
 const saved=await page.evaluate(()=>localStorage.getItem('plotstatlab.project.v1')!);
 await page.reload();
 await page.locator('input[type=file]').first().setInputFiles({name:'workspace.psl',mimeType:'application/json',buffer:Buffer.from(saved)});
 await expect(page.locator('.dataset-navigation>button')).toHaveCount(3);
 await expect(page.locator('.workspace-analysis-card')).toHaveCount(2);
});
