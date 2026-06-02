import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// The TokenTour palette is authored in OKLCH; render at a higher color depth
// so the soft cyan-milk surfaces don't band.
Config.setColorSpace("bt709");
