import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';

const statistics=(page:Page)=>page.locator('.tab-switch').getByRole('button',{name:'Statistics',exact:true});
const data=(page:Page)=>page.locator('.tab-switch').getByRole('button',{name:'Data',exact:true});
async function saved(page:Page){return page.evaluate(()=>JSON.parse(localStorage.getItem('plotstatlab.project.v1')!))}
async function resultCount(page:Page,count:number){await expect.poll(async()=>(await saved(page)).analysisRuns?.length??0).toBe(count)}
async function downloadText(download:any){const stream=await download.createReadStream();const chunks:Buffer[]=[];for await(const chunk of stream)chunks.push(Buffer.from(chunk));return Buffer.concat(chunks).toString()}

test('blank table accepts a pasted range; new figures explicitly choose dataset and columns',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 await page.getByRole('button',{name:'New dataset',exact:true}).first().click();
 await page.getByLabel('New dataset name',{exact:true}).fill('Direct entry');await page.getByRole('button',{name:'Create blank table',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Direct entry',exact:true})).toBeVisible();
 const first=page.getByLabel('Group A, row 1',{exact:true});
 await first.evaluate((element,text)=>{const clipboardData=new DataTransfer();clipboardData.setData('text/plain',text);element.dispatchEvent(new ClipboardEvent('paste',{clipboardData,bubbles:true,cancelable:true}))},'1\t4\n2\t5\n3\t7\n2\t6');
 await expect(page.getByLabel('Group B, row 4',{exact:true})).toHaveValue('6');
 const direct=(await saved(page)).datasets.find((d:any)=>d.name==='Direct entry');expect(direct.groups.map((g:any)=>g.observations.length)).toEqual([4,4]);
 await page.getByRole('button',{name:'Create figure from this data',exact:true}).click();
 await expect(page.getByLabel('New figure dataset',{exact:true})).toHaveValue(direct.id);
 await page.locator('.gallery-data-source').getByLabel('Group B',{exact:true}).uncheck();
 await page.getByRole('button',{name:'Bar + swarm Mean, error and every observation',exact:true}).click();
 await expect(page.getByLabel('Figure dataset',{exact:true})).toHaveValue(direct.id);
 await expect(page.locator('#chart-svg [data-point-id]')).toHaveCount(4);
 const p=await saved(page),figure=p.charts.find((c:any)=>c.id===p.activeChartId);expect(figure.datasetId).toBe(direct.id);expect(figure.groupIds).toEqual([direct.groups[0].id]);expect(errors).toEqual([]);
});

test('label columns, selected-pair tests, saved results, stars, point context editing and exclusion survive reopening',async({page})=>{
 test.setTimeout(60000);
 const errors:string[]=[],external:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(['127.0.0.1','localhost'].includes(url.hostname)||['data:','blob:'].includes(url.protocol))return route.continue();external.push(url.href);return route.abort()});
 await page.goto('/');
 await page.locator('input[type=file][multiple]').setInputFiles({name:'Labels.csv',mimeType:'text/csv',buffer:Buffer.from('Sample,Notes,Control,Treated,Extra\ns1,healthy,1,10,30\ns2,healthy,2,12,31\ns3,stressed,3,11,32\ns4,stressed,2,14,29\ns5,healthy,4,13,33')});
 await page.locator('.dataset-navigation>button').filter({hasText:'Labels'}).click();
 await expect(page.getByLabel('Notes, row 3',{exact:true})).toHaveValue('stressed');
 const initial=await saved(page),dataset=initial.datasets.find((d:any)=>d.name==='Labels');expect(dataset.groups).toHaveLength(3);
 await statistics(page).click();
 await page.locator('.analysis-group-choices').getByLabel('Extra',{exact:false}).uncheck();
 await expect(page.getByRole('button',{name:'Run and save new analysis',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Run and save new analysis',exact:true}).click();await resultCount(page,1);
 const run1=(await saved(page)).analysisRuns[0];expect(run1.result.test).toBe('welch');expect(run1.result.comparisons[0].label).toMatch(/^\*+$/);
 await page.getByRole('radio',{name:/Student t-test/}).check();
 await page.getByRole('button',{name:'Run and save new analysis',exact:true}).click();await resultCount(page,2);
 await page.getByLabel('Open saved result',{exact:true}).selectOption(run1.id);
 await data(page).click();await statistics(page).click();await expect(page.getByLabel('Open saved result',{exact:true})).toHaveValue(run1.id);
 const csvPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Results CSV',exact:true}).click();expect(await downloadText(await csvPromise)).toContain('Adjusted p');
 await page.getByRole('button',{name:'Add stars / ns to figure',exact:true}).click();await page.getByRole('button',{name:'Open figure',exact:true}).click();
 await expect(page.locator('#chart-svg [data-annotation-id]')).toHaveCount(1);
 const first=page.locator('#chart-svg [data-point-id]').first(),pointId=await first.getAttribute('data-point-id');
 await first.click({button:'right'});await page.getByRole('menuitem',{name:'Format this point',exact:true}).click();
 await page.getByLabel('Point color hex',{exact:true}).fill('#dd1177');await page.getByLabel('Point color hex',{exact:true}).press('Enter');
 await expect(first.locator('circle').first()).toHaveAttribute('fill','#dd1177');
 const second=page.locator('#chart-svg [data-point-id]').nth(1);await expect(second.locator('circle').first()).not.toHaveAttribute('fill','#dd1177');
 await first.click({button:'right'});await page.getByRole('menuitem',{name:'Exclude from analysis',exact:true}).click();
 await expect(first).toBeVisible();await expect(page.locator('#chart-svg [data-annotation-id]')).toHaveCount(0);
 await data(page).click();await expect(page.locator('.data-grid-cell-excluded')).toHaveCount(1);
 await expect(page.getByLabel('Control, row 1',{exact:true})).toHaveValue('1');
 await statistics(page).click();await expect(page.getByText('Data changed after this result was calculated.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Run and save new analysis',exact:true}).click();await resultCount(page,3);
 const p=await saved(page),last=p.analysisRuns.at(-1);expect(last.result.summaries.find((s:any)=>s.group===dataset.groups[0].id).n).toBe(4);
 expect(p.datasets.find((d:any)=>d.id===dataset.id).groups[0].observations.find((o:any)=>o.id===pointId).excluded).toBe(true);
 await page.getByRole('button',{name:'Add stars / ns to figure',exact:true}).click();await page.getByRole('button',{name:'Open figure',exact:true}).click();
 await expect(page.locator('#chart-svg [data-annotation-id]')).toHaveCount(1);
 const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Save workspace',exact:true}).click();const text=await downloadText(await downloaded);
 await page.locator('input[type=file]').first().setInputFiles({name:'workflow.psl',mimeType:'application/json',buffer:Buffer.from(text)});
 await page.locator('.figure-item').filter({hasText:'Labels'}).click();
 await expect(page.locator(`#chart-svg [data-point-id="${pointId}"]`)).toHaveAttribute('data-excluded','true');await expect(page.locator(`#chart-svg [data-point-id="${pointId}"] circle`).first()).toHaveAttribute('stroke','#dd1177');
 expect((await saved(page)).analysisRuns).toHaveLength(3);
 await data(page).click();await page.getByLabel('Control, row 1',{exact:true}).click({button:'right'});await page.getByRole('menuitem',{name:'Restore value to analysis',exact:true}).click();await expect(page.locator('.data-grid-cell-excluded')).toHaveCount(0);
 await page.locator('.tab-switch').getByRole('button',{name:'Editor',exact:true}).click();await expect(page.locator(`#chart-svg [data-point-id="${pointId}"] circle`).first()).toHaveAttribute('fill','#dd1177');expect(errors).toEqual([]);expect(external).toEqual([]);
});

test('workspace switcher keeps distinct workspaces and opens them again',async({page})=>{
 await page.goto('/');const initial=await saved(page);
 await page.getByRole('button',{name:'Switch workspace',exact:true}).click();await page.getByLabel('New workspace name',{exact:true}).fill('Second workspace');await page.getByRole('button',{name:'Create blank workspace',exact:true}).click();
 await expect(page.getByRole('button',{name:'Switch workspace',exact:true})).toContainText('Second workspace');const second=await saved(page);expect(second.id).not.toBe(initial.id);
 await page.getByRole('button',{name:'Switch workspace',exact:true}).click();await page.locator('.workspace-entry').filter({hasText:initial.name}).click();await expect(page.getByRole('button',{name:'Switch workspace',exact:true})).toContainText(initial.name);expect((await saved(page)).id).toBe(initial.id);
 await page.getByRole('button',{name:'Switch workspace',exact:true}).click();await page.locator('.workspace-entry').filter({hasText:'Second workspace'}).click();expect((await saved(page)).id).toBe(second.id);
});
