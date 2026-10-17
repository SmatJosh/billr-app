import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

// Logos are shrunk to at most 320 px on the long side, enough for a sharp PDF header and small enough
// (tens of KB) to back up with the business.
const MAX_SIDE = 320;

// Opens the phone's photo picker and returns the logo as a data URI, or null if nothing was picked.
// PNGs stay PNG so a see-through background stays see-through.
export async function pickLogo(): Promise<string | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  const asset = res.canceled ? null : res.assets[0];
  if (!asset) return null;
  const png = (asset.mimeType ?? asset.uri).toLowerCase().includes('png');
  const ctx = ImageManipulator.manipulate(asset.uri);
  const scale = MAX_SIDE / Math.max(asset.width, asset.height);
  // Both sides given: the web version cannot work out the missing one.
  if (scale < 1) ctx.resize({ width: Math.round(asset.width * scale), height: Math.round(asset.height * scale) });
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ format: png ? SaveFormat.PNG : SaveFormat.JPEG, compress: 0.85, base64: true });
  return saved.base64 ? `data:image/${png ? 'png' : 'jpeg'};base64,${saved.base64}` : null;
}
