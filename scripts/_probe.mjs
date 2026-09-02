import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:5173/' });
globalThis.window = dom.window; globalThis.document = dom.window.document;
globalThis.Event = dom.window.Event; globalThis.MouseEvent = dom.window.MouseEvent;
globalThis.getComputedStyle = dom.window.getComputedStyle;
for (const n of Object.getOwnPropertyNames(dom.window)) if (n.startsWith('HTML')||n==='Node'||n==='Element') globalThis[n]=dom.window[n];

const { keyboard, bindKeyboard } = await import('../src/ui/keyboard.js');
const form = document.createElement('div'); form.className='form';
const input = document.createElement('input'); input.dataset.field='nombre';
form.appendChild(input); document.body.appendChild(form);
bindKeyboard(input, { label: 'Nombre' });
input.dispatchEvent(new dom.window.Event('focus'));

const btn = [...document.querySelectorAll('.kb .hg-button')].find(b=>b.textContent.trim()==='d');
console.log('boton:', btn && btn.outerHTML.slice(0,120));
console.log('onclick?', typeof btn.onclick, 'onpointerdown?', typeof btn.onpointerdown, 'onmousedown?', typeof btn.onmousedown);
console.log('setRangeText?', typeof input.setRangeText);
btn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
console.log('valor tras click:', JSON.stringify(input.value));
dom.window.close();
