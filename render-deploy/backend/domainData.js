// ============================================================
// SCARLET DOMAIN KNOWLEDGE — combined 47-domain catalog
// Merges the part files into a single DOMAIN_DATA lookup used by
// the generator, domain guard, and template system.
// ============================================================

import { DOMAIN_PART1 } from './domainPart1.js';
import { DOMAIN_PART2 } from './domainPart2.js';
import { DOMAIN_PART3 } from './domainPart3.js';
import { DOMAIN_PART4 } from './domainPart4.js';
import { DOMAIN_PART5 } from './domainPart5.js';
import { DOMAIN_PART6 } from './domainPart6.js';
import { DOMAIN_PART7 } from './domainPart7.js';
import { DOMAIN_PART8 } from './domainPart8.js';
import { DOMAIN_PART9 } from './domainPart9.js';
import { DOMAIN_PART10 } from './domainPart10.js';

export const DOMAIN_DATA = {
  ...DOMAIN_PART1,
  ...DOMAIN_PART2,
  ...DOMAIN_PART3,
  ...DOMAIN_PART4,
  ...DOMAIN_PART5,
  ...DOMAIN_PART6,
  ...DOMAIN_PART7,
  ...DOMAIN_PART8,
  ...DOMAIN_PART9,
  ...DOMAIN_PART10,
};

export const ALL_DOMAINS = Object.keys(DOMAIN_DATA);
export const ALL_SPECIALTIES = Object.fromEntries(
  Object.entries(DOMAIN_DATA).map(([domain, cfg]) => [
    domain,
    Object.keys(cfg.specialties || {}),
  ])
);
