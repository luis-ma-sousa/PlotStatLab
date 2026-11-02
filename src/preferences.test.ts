import {afterEach,expect,it,vi} from 'vitest';
import {loadAutosave,normalizeHex,persistAutosave} from './preferences';
afterEach(()=>vi.unstubAllGlobals());
it('defaults to autosave on and persists either user choice without touching project data',()=>{
 const storage=new Map<string,string>([['plotstatlab.project.v1','unchanged']]);
 vi.stubGlobal('localStorage',{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v)});
 expect(loadAutosave()).toBe(true);persistAutosave(false);expect(loadAutosave()).toBe(false);
 expect(storage.get('plotstatlab.project.v1')).toBe('unchanged');persistAutosave(true);expect(loadAutosave()).toBe(true);
});
it('normalizes short, long, mixed-case and unprefixed HEX and rejects invalid input',()=>{
 expect(normalizeHex('#AbC')).toBe('#aabbcc');expect(normalizeHex(' 12ABef ')).toBe('#12abef');expect(normalizeHex('#000000')).toBe('#000000');
 for(const input of ['#12','12345','red','#gggggg','12abef44',''])expect(normalizeHex(input)).toBeNull();
});
