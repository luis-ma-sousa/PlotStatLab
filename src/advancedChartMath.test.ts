import {describe, expect, it} from 'vitest';
import {agreementCoordinates, agreementSummary, forestInterval, kaplanMeier, paddedDomain, stepPath, survivalAt, volcanoCoordinates} from './advancedChartMath';
import type {AdvancedRow} from './advancedTypes';

describe('advanced scientific coordinates', () => {
  it('plots actual p-values on a volcano axis without converting zero into an invented result', () => {
    expect(volcanoCoordinates({id: 'a', x: -2, y: .001})).toEqual({x: -2, y: 3});
    expect(volcanoCoordinates({id: 'a', x: 2, y: 1})).toEqual({x: 2, y: 0});
    for (const p of [0, -1, 1.1, Infinity, NaN]) expect(volcanoCoordinates({id:'a', x:1, y:p})).toBeUndefined();
    expect(volcanoCoordinates({id:'a',x:1,y:10,p:.01})).toEqual({x:1,y:2});
  });
  it('uses paired means and a stated Y minus X convention with sample-SD agreement limits', () => {
    const rows: AdvancedRow[] = [{id:'a',x:10,y:12},{id:'b',x:11,y:14},{id:'c',x:20,y:24},{id:'excluded',x:0,y:1000,excluded:true}];
    expect(agreementCoordinates(rows[0])).toEqual({x:11,y:2});
    expect(agreementSummary(rows)).toEqual({bias:3,lower:1.04,upper:4.96});
    expect(agreementSummary(rows.slice(0,1))).toBeUndefined();
    expect(agreementCoordinates({id:'bad',y:1})).toBeUndefined();
  });
  it('requires an interval surrounding the estimate without silently swapping bounds', () => {
    expect(forestInterval({id:'a',y:2,lower:1,upper:3})).toEqual({estimate:2,lower:1,upper:3});
    for (const row of [{id:'a',y:2},{id:'a',y:2,lower:3,upper:1},{id:'a',y:2,lower:0,upper:1}]) expect(forestInterval(row)).toBeUndefined();
  });
});

describe('Kaplan–Meier display calculations', () => {
  it('uses all subjects at risk before tied events and censors, retaining censor identities', () => {
    const rows: AdvancedRow[] = [{id:'c',y:2,event:false},{id:'a',y:2,event:true},{id:'b',y:3,event:true},{id:'d',y:4,event:false}];
    const original = structuredClone(rows), steps = kaplanMeier(rows);
    expect(steps).toEqual([
      {x:0,y:1,nRisk:4,events:0,censors:[]},
      {x:2,y:.75,nRisk:4,events:1,censors:['c']},
      {x:3,y:.375,nRisk:2,events:1,censors:[]},
      {x:4,y:.375,nRisk:1,events:0,censors:['d']},
    ]);
    expect(rows).toEqual(original);
    expect(survivalAt(steps,1)).toBe(1); expect(survivalAt(steps,2)).toBe(.75); expect(survivalAt(steps,5)).toBe(.375);
    expect(stepPath(steps,n=>n*10,n=>100-n*100)).toBe('M0,0H20V25H30V62.5H40V62.5');
  });
  it('does not silently classify missing event indicators or excluded observations', () => {
    expect(kaplanMeier([{id:'a',y:1,event:true},{id:'b',y:2,event:true,excluded:true},{id:'c',y:3},{id:'d',y:-1,event:false}])).toEqual([{x:0,y:1,nRisk:1,events:0,censors:[]},{x:1,y:0,nRisk:1,events:1,censors:[]}]);
  });
  it('handles an event at time zero and all-censored data without negative survival', () => {
    expect(kaplanMeier([{id:'a',y:0,event:true},{id:'b',y:1,event:false}])[1].y).toBe(.5);
    expect(kaplanMeier([{id:'a',y:2,event:false},{id:'b',y:4,event:false}]).every(step=>step.y===1)).toBe(true);
  });
});

it('builds finite padded axes for constant data and 200,000 values without argument overflow', () => {
  expect(paddedDomain([])).toEqual([0,1]);
  expect(paddedDomain([5,5])).toEqual([4.6,5.4]);
  expect(paddedDomain([-1,NaN,Infinity,2])).toEqual([-1.24,2.24]);
  expect(paddedDomain(Array.from({length:200_000},(_,index)=>index))).toEqual([-15999.92,215998.92]);
});
