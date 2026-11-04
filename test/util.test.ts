import { describe, expect, it } from 'vitest';
import { clamp, ease, esc, isEditable, isNone, isTransparent, pick, sanitize } from '../src/util';

describe('util', () => {
  it('ease maps 0..1 onto 0..1 and is symmetric', () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.5);
    expect(ease(0.25) + ease(0.75)).toBeCloseTo(1);
  });

  it('clamp', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.3, 0, 1)).toBe(0.3);
  });

  it('pick copies only the requested props', () => {
    const el = document.createElement('div');
    el.style.color = 'red';
    document.body.appendChild(el);
    const out = pick(getComputedStyle(el), ['color']);
    expect(Object.keys(out)).toEqual(['color']);
    el.remove();
  });

  it('treats empty / transparent as no paint', () => {
    expect(isTransparent('')).toBe(true);
    expect(isTransparent('rgba(0, 0, 0, 0)')).toBe(true);
    expect(isTransparent('rgb(1, 2, 3)')).toBe(false);
    expect(isNone('none')).toBe(true);
    expect(isNone('')).toBe(true);
    expect(isNone('0 1px red')).toBe(false);
  });

  it('esc escapes html', () => {
    expect(esc(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });

  it('sanitize strips scripts and on* handlers', () => {
    const d = document.createElement('div');
    d.innerHTML = '<p onclick="x()">hi<script>1</script><img src="a" onerror="y()"></p>';
    sanitize(d);
    expect(d.querySelector('script')).toBeNull();
    expect(d.innerHTML).not.toMatch(/onclick|onerror/);
    expect(d.textContent).toBe('hi');
  });

  it('isEditable detects form fields', () => {
    expect(isEditable(document.createElement('input'))).toBe(true);
    expect(isEditable(document.createElement('textarea'))).toBe(true);
    expect(isEditable(document.createElement('div'))).toBe(false);
    expect(isEditable(null)).toBe(false);
  });
});

describe('pageSize', () => {
  it('uses the layout width (without the scrollbar), not innerWidth', async () => {
    const { pageSize } = await import('../src/util');
    const de = document.documentElement;
    Object.defineProperty(de, 'clientWidth', { value: 1000, configurable: true });
    Object.defineProperty(de, 'clientHeight', { value: 700, configurable: true });
    Object.defineProperty(de, 'scrollWidth', { value: 1000, configurable: true });
    Object.defineProperty(de, 'scrollHeight', { value: 2400, configurable: true });
    Object.defineProperty(window, 'innerWidth', { value: 1015, configurable: true });
    expect(pageSize()).toEqual({ w: 1000, h: 2400 });
  });
});
