import * as ImagePicker from "expo-image-picker";
import { Attachment, AttachmentType } from "./store";

export async function pickMedia(multiple=true):Promise<Attachment[]> {
  const permission=await ImagePicker.requestMediaLibraryPermissionsAsync();
  if(!permission.granted) throw new Error("Media permission is required to choose photos and videos.");
  const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:["images","videos"],allowsMultipleSelection:multiple,quality:1,selectionLimit:multiple?10:1});
  if(result.canceled) return [];
  return result.assets.map((a)=>({
    id:`att-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    uri:a.uri,
    type:(a.type==="video"?"video":"image") as AttachmentType,
    name:a.fileName||`media-${Date.now()}`,
    mimeType:a.mimeType||undefined,
    width:a.width||undefined,
    height:a.height||undefined,
    duration:a.duration||undefined
  }));
}
