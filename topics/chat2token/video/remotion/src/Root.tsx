import React from "react";
import { Composition } from "remotion";
import {
  Scene10Tokens,
  Clip10A,
  Clip10B,
  Clip10C,
  SCENE10_DURATION,
  CLIP_A,
  CLIP_B,
  CLIP_C,
} from "./scenes/Scene10Tokens";
import { Scene0Intro, SCENE0_DURATION } from "./scenes/Scene0Intro";
import { Scene2Messages, SCENE2_DURATION } from "./scenes/Scene2Messages";
import { Scene3Roles, SCENE3_DURATION } from "./scenes/Scene3Roles";
import { Scene4Context, SCENE4_DURATION } from "./scenes/Scene4Context";
import { Scene5ToolCalls, SCENE5_DURATION } from "./scenes/Scene5ToolCalls";
import { Scene6ReAct, SCENE6_DURATION } from "./scenes/Scene6ReAct";
import { Scene7Template, SCENE7_DURATION } from "./scenes/Scene7Template";
import { Scene8Templates, SCENE8_DURATION } from "./scenes/Scene8Templates";
import { Scene9SpecialTokens, SCENE9_DURATION } from "./scenes/Scene9SpecialTokens";
import { Scene12Strawberry, SCENE12_DURATION } from "./scenes/Scene12Strawberry";
import { Scene16PrefixTree, SCENE16_DURATION } from "./scenes/Scene16PrefixTree";
import { Scene17ContextKv, SCENE17_DURATION } from "./scenes/Scene17ContextKv";
import { Cover, COVER_W, COVER_H, FogBg, FOGBG_W, FOGBG_H } from "./scenes/Cover";

/**
 * Remotion root. 1920×1080 @ 60fps.
 *
 * Scenes are authored in 30fps frame-space (see `lib/fps.ts`); the helpers there
 * remap every keyframe to the real render fps, so bumping FPS below keeps the
 * exact same wall-clock pacing while doubling the rendered frame count.
 *
 * Compositions:
 *   Scene2-Messages       — 你看到的↔模型看到的：Chat / Messages / JSON 三栏
 *   Scene3-Roles          — 四种角色 + system 聚光小剧场
 *   Scene10-Tokens        — review master (all three beats, with edit handles)
 *   Scene10A-Tokens       — beat A standalone clip  (含特殊 token 的对话切分)
 *   Scene10B-Compare      — beat B standalone clip  (Qwen3 vs DeepSeek-V3)
 *   Scene10C-Granularity  — beat C standalone clip  (字符→字节→Token)
 *
 * Every clip carries ~1s head / ~1.5s tail of STATIC frames for cutting.
 * See `topics/chat2token/video/scenes.md` for the plan.
 */
const FPS = 60;
const AUTHOR_FPS = 30;
// author-frame count → real frame count at the render fps
const dur = (authorFrames: number) => Math.round((authorFrames * FPS) / AUTHOR_FPS);

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Cover"
        component={Cover}
        durationInFrames={60}
        fps={FPS}
        width={COVER_W}
        height={COVER_H}
      />
      <Composition
        id="FogBg"
        component={FogBg}
        durationInFrames={600}
        fps={FPS}
        width={FOGBG_W}
        height={FOGBG_H}
      />
      <Composition
        id="Scene0-Intro"
        component={Scene0Intro}
        durationInFrames={dur(SCENE0_DURATION)}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="Scene2-Messages"
        component={Scene2Messages}
        durationInFrames={dur(SCENE2_DURATION)}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="Scene3-Roles"
        component={Scene3Roles}
        durationInFrames={dur(SCENE3_DURATION)}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="Scene4-Context"
        component={Scene4Context}
        durationInFrames={dur(SCENE4_DURATION)}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="Scene5-Tools"
        component={Scene5ToolCalls}
        durationInFrames={dur(SCENE5_DURATION)}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="Scene6-ReAct"
        component={Scene6ReAct}
        durationInFrames={dur(SCENE6_DURATION)}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="Scene7-Template"
        component={Scene7Template}
        durationInFrames={dur(SCENE7_DURATION)}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="Scene8-Templates"
        component={Scene8Templates}
        durationInFrames={dur(SCENE8_DURATION)}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="Scene9-Special"
        component={Scene9SpecialTokens}
        durationInFrames={dur(SCENE9_DURATION)}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="Scene12-Strawberry"
        component={Scene12Strawberry}
        durationInFrames={dur(SCENE12_DURATION)}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="Scene16-PrefixTree"
        component={Scene16PrefixTree}
        durationInFrames={dur(SCENE16_DURATION)}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="Scene17-ContextKv"
        component={Scene17ContextKv}
        durationInFrames={dur(SCENE17_DURATION)}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="Scene10-Tokens"
        component={Scene10Tokens}
        durationInFrames={dur(SCENE10_DURATION)}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="Scene10A-Tokens"
        component={Clip10A}
        durationInFrames={dur(CLIP_A)}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="Scene10B-Compare"
        component={Clip10B}
        durationInFrames={dur(CLIP_B)}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="Scene10C-Granularity"
        component={Clip10C}
        durationInFrames={dur(CLIP_C)}
        fps={FPS}
        width={1920}
        height={1080}
      />
    </>
  );
};
