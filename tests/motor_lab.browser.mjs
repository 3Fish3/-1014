/**
 * Compatibility entry point for the Motor Lab browser regression suite.
 * The real-model suite starts its own loopback server and obtains live projected
 * ports instead of relying on the former procedural geometry/camera constants.
 * Missing models fail the suite; they are never replaced with procedural boxes.
 */
import './motor_lab.real.browser.mjs';
