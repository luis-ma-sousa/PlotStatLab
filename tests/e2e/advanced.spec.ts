import {test,expect} from '@playwright/test';
async function downloadText(download:any){const stream=await download.createReadStream();const chunks:Buffer[]=[];for await(const chunk of stream)chunks.push(Buffer.from(chunk));return Buffer.concat(chunks).toString()}

test('advanced analyses, individual edits, multipanel vector export and complete workspace reopening work without external HTTP',async({page})=>{
 const external:string[]=[],errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(['127.0.0.1','localhost'].includes(url.hostname)||['data:','blob:'].includes(url.protocol))return route.continue();external.push(url.href);return route.abort()});
 await page.goto('/');
 await page.locator('input[type=file][accept*=".csv"]').setInputFiles([
  {name:'Local XY.csv',mimeType:'text/csv',buffer:Buffer.from('x,y\n1,2.2\n2,3.8\n3,6.1\n4,7.7\n5,10.3\n6,12.1')},
  {name:'Local Survival.csv',mimeType:'text/csv',buffer:Buffer.from('group,time,event\nControl,2,1\nControl,3,1\nControl,4,0\nControl,5,1\nControl,6,1\nControl,8,0\nTreated,3,1\nTreated,5,0\nTreated,7,1\nTreated,9,0\nTreated,10,1\nTreated,12,0')},
 ]);
 await expect(page.locator('.dataset-navigation>button')).toHaveCount(3);
 await page.locator('.tab-switch').getByRole('button',{name:'Statistics',exact:true}).click();
 await page.getByRole('button',{name:'Factorial, regression & survival',exact:true}).click();
 await page.getByLabel('Advanced analysis',{exact:true}).selectOption('linear-regression');
 await page.getByRole('button',{name:'Run analysis',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Ordinary least-squares linear regression',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Create figure with this result',exact:true}).click();
 await expect(page.locator('#chart-svg [data-series-name="Linear fit"]')).toBeVisible();
 const point=page.locator('#chart-svg [data-point-id]').first();const pointId=await point.getAttribute('data-point-id');await point.press('Enter');
 await page.getByLabel('Point color hex',{exact:true}).fill('#ab24df');await page.getByLabel('Point color hex',{exact:true}).press('Enter');
 await page.locator('.figure-text-shortcuts').getByRole('button',{name:'Chart title',exact:true}).click();
 const title=page.getByRole('textbox',{name:'Chart title',exact:true});await expect(title).toBeFocused();await title.fill('H2O and X2');
 await title.press('Home');await title.press('ArrowRight');await title.press('Shift+ArrowRight');await page.getByRole('button',{name:'Subscript Chart title',exact:true}).click();
 await title.press('End');await title.press('Shift+ArrowLeft');await page.getByRole('button',{name:'Superscript Chart title',exact:true}).click();
 await expect(page.locator('#chart-svg tspan[baseline-shift="sub"]')).toHaveText('2');
 await expect(page.locator('#chart-svg tspan[baseline-shift="super"]')).toHaveText('2');
 await page.locator('.dataset-navigation>button').filter({hasText:'Local Survival'}).click();
 await page.locator('.tab-switch').getByRole('button',{name:'Statistics',exact:true}).click();
 await page.getByRole('button',{name:'Group comparisons & outliers',exact:true}).click();
 await expect(page.getByRole('heading',{name:'These data contain right-censored outcomes.',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Detect outliers',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Open survival methods',exact:true}).click();
 await page.getByLabel('Advanced analysis',{exact:true}).selectOption('survival');await page.getByRole('button',{name:'Run analysis',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Kaplan–Meier + log-rank survival analysis',exact:true})).toBeVisible();
 await page.locator('.tab-switch').getByRole('button',{name:'Overview',exact:true}).click();
 await expect(page.locator('.advanced-overview-results .advanced-results')).toHaveCount(2);
 await page.locator('.tab-switch').getByRole('button',{name:'Publication',exact:true}).click();
 await page.getByLabel('Publication size preset').selectOption('nature-double');
 await page.locator('.publication-choices label').filter({hasText:'Local XY · Regression'}).getByRole('checkbox').check();
 const vectorPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export SVG',exact:true}).click();const vector=await downloadText(await vectorPromise);
 expect(vector).toContain('width="180mm"');expect(vector).toContain('baseline-shift="sub"');expect(vector).toContain('#ab24df');expect(vector).not.toMatch(/<image|foreignObject|data-editor-only/);
 const savedPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Save workspace',exact:true}).click();const saved=await downloadText(await savedPromise);const state=JSON.parse(saved);
 expect(state.datasets.filter((d:any)=>d.advancedAnalyses?.length).length).toBe(2);expect(state.publication.preset).toBe('nature-double');
 await page.locator('input[type=file][accept*=".psl"]').setInputFiles({name:'offline-roundtrip.psl',mimeType:'application/json',buffer:Buffer.from(saved)});
 await page.reload();await page.locator('.tab-switch').getByRole('button',{name:'Overview',exact:true}).click();
 await expect(page.locator('.advanced-overview-results .advanced-results')).toHaveCount(2);
 expect(state.charts.some((c:any)=>c.pointStyles[pointId!]?.color==='#ab24df')).toBe(true);
 expect(external).toEqual([]);expect(errors).toEqual([]);
});

test('modal keyboard focus, escape, gallery catalog and large table paging',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Help',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
 await page.keyboard.press('Shift+Tab');expect(await dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true);await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(page.getByRole('button',{name:'Help',exact:true})).toBeFocused();
 await page.locator('.sidebar').getByRole('button',{name:'New chart',exact:true}).first().click();await expect(page.locator('.gallery-card')).toHaveCount(20);await page.keyboard.press('Escape');
 const rows=Array.from({length:250},(_,i)=>`S${i},${i},${i+5}`).join('\n');await page.locator('input[type=file][accept*=".csv"]').setInputFiles({name:'Large table.csv',mimeType:'text/csv',buffer:Buffer.from('Subject,Control,Treated\n'+rows)});
 await page.locator('.dataset-navigation>button').filter({hasText:'Large table'}).click();await expect(page.getByLabel('Subject ID 100',{exact:true})).toBeVisible();await expect(page.getByLabel('Subject ID 101',{exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Next rows',exact:true}).click();await expect(page.getByLabel('Subject ID 101',{exact:true})).toBeVisible();
});

test('native Excel import preserves visible sheets, explicit XY columns and import notes',async({page})=>{
 await page.goto('/');await page.locator('input[type=file][accept*=".xlsx"]').setInputFiles('tests/fixtures/synthetic-multiple-sheets.xlsx');
 await expect(page.locator('.dataset-navigation>button')).toHaveCount(3);
 await expect(page.getByText(/1 hidden worksheet/)).toBeVisible();
 await page.locator('.dataset-navigation>button').filter({hasText:'· XY'}).click();
 await expect(page.getByLabel('x, observation 1',{exact:true})).toHaveValue('1');
 await expect(page.getByLabel('y, observation 1',{exact:true})).toHaveValue('2.2');
 await page.locator('.tab-switch').getByRole('button',{name:'Editor',exact:true}).click();
 await expect(page.locator('#chart-svg [data-point-id]')).toHaveCount(5);
});
