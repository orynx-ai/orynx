import type { Gate } from '../lib/gate.ts';
import agentRules from './agent-rules.ts';
import boundaries from './boundaries.ts';
import componentCoverage from './component-coverage.ts';
import designSource from './design-source.ts';
import envPolicy from './env-policy.ts';
import handbookSize from './handbook-size.ts';
import iconButtons from './icon-buttons.ts';
import learnFreshness from './learn-freshness.ts';
import reviewStamp from './review-stamp.ts';
import secrets from './secrets.ts';
import specs from './specs.ts';
import stylePolicy from './style-policy.ts';
import testPolicy from './test-policy.ts';

/** Every gate, in the order the runner prints them. Add a new gate here and give it a test file. */
export const gates: readonly Gate[] = [
  stylePolicy,
  boundaries,
  componentCoverage,
  envPolicy,
  testPolicy,
  designSource,
  iconButtons,
  agentRules,
  handbookSize,
  secrets,
  specs,
  reviewStamp,
  learnFreshness,
];
