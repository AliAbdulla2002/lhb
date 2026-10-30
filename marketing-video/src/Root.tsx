import { Composition } from "remotion";
import { LahabReel, TOTAL } from "./LahabReel";
import { OgImage } from "./OgImage";

export const Root = () => (
  <>
    <Composition id="LahabReel" component={LahabReel} durationInFrames={TOTAL} fps={30} width={1080} height={1920} />
    <Composition id="OgImage" component={OgImage} durationInFrames={1} fps={30} width={1200} height={630} />
  </>
);
