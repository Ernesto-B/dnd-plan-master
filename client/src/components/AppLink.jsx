import React from 'react';
import { Link } from 'react-router-dom';

// Native (ported) route prefixes → use client-side <Link> for flash-free nav.
const NATIVE = [
  /^\/sessions$/, /^\/encounters$/, /^\/npcs$/, /^\/locations$/, /^\/factions$/, /^\/campaign$/, /^\/campaigns$/, /^\/settings$/,
  /^\/view\//, /^\/encounter\/view\//, /^\/npc\/view\//, /^\/location\/view\//, /^\/faction\/view\//, /^\/map$/,
  // Forms (all ported): session new/edit (/form), and entity new/edit.
  /^\/form$/, /^\/npc\/(new|edit)/, /^\/encounter\/(new|edit)/, /^\/location\/(new|edit)/, /^\/faction\/(new|edit)/,
];

export function isNativeHref(to) {
  if (!to || to.startsWith('#') || to.startsWith('http')) return false;
  const path = to.split('#')[0].split('?')[0];
  return NATIVE.some(re => re.test(path));
}

// Renders a <Link> for native routes (instant) and a plain <a> for legacy
// pages (full load). As pages get ported, add their prefix to NATIVE above.
export default function AppLink({ to, children, ...rest }) {
  return isNativeHref(to)
    ? <Link to={to} {...rest}>{children}</Link>
    : <a href={to} {...rest}>{children}</a>;
}
