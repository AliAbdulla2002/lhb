import { Composition } from "remotion";
import { LahabReel, TOTAL } from "./LahabReel";

export const Root = () => (
  <Composition id="LahabReel" component={LahabReel} durationInFrames={TOTAL} fps={30} width={1080} height={1920} />
);
