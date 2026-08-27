import React, { useEffect, useMemo, useState } from "react";
import {
  Alert, FlatList, SafeAreaView, StatusBar, StyleSheet, Text,
  TextInput, TouchableOpacity, View, Switch
} from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { initIdentity, getIdentity, createIdentity, Identity } from "./src/core/identity";
import { initVault, saveVault, readVault } from "./src/core/vault";
import { useNexChatStore } from "./src/core/store";

type Tab = "Chats" | "Discover" | "Calls" | "Vault" | "Settings";

const COLORS = {
  bg: "#F5F8FB", card: "#FFFFFF", ink: "#102A43", muted: "#66788A",
  brand: "#0C5A8D", brand2: "#167DB7", line: "#D9E2EC",
  danger: "#B42318", good: "#087443"
};

function Logo({ small=false }: {small?: boolean}) {
  return (
    <View style={[styles.logo, small && {width:42,height:42,borderRadius:14}]}>
      <Text style={[styles.logoN, small && {fontSize:22}]}>N</Text>
      <View style={styles.lock}><View style={styles.lockBody}/></View>
    </View>
  );
}

function Header({title, subtitle}:{title:string;subtitle?:string}) {
  return <View style={styles.header}>
    <View style={{flexDirection:"row",alignItems:"center",gap:12}}>
      <Logo small />
      <View><Text style={styles.title}>{title}</Text>{subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}</View>
    </View>
  </View>;
}

function Empty({title, body, action, onPress}:{title:string;body:string;action?:string;onPress?:()=>void}) {
  return <View style={styles.empty}>
    <Logo />
    <Text style={styles.emptyTitle}>{title}</Text>
    <Text style={styles.emptyBody}>{body}</Text>
    {action && <TouchableOpacity style={styles.primary} onPress={onPress}><Text style={styles.primaryText}>{action}</Text></TouchableOpacity>}
  </View>
}

function Chats({onNew}:{onNew:()=>void}) {
  const { messages } = useNexChatStore();
  return <View style={{flex:1}}>
    <Header title="Chats" subtitle="Local-first messaging" />
    {messages.length === 0
      ? <Empty title="Your messages stay yours" body="Start a local conversation. The first message is stored through the NexChat encrypted vault." action="New message" onPress={onNew}/>
      : <FlatList data={messages} keyExtractor={(_,i)=>String(i)} contentContainerStyle={{padding:16,gap:10}}
          renderItem={({item})=><View style={styles.chatCard}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{item.peer[0]}</Text></View>
            <View style={{flex:1}}><Text style={styles.cardTitle}>{item.peer}</Text><Text style={styles.cardBody}>{item.text}</Text></View>
            <Text style={styles.time}>{item.status}</Text>
          </View>}
        />}
    <TouchableOpacity style={styles.fab} onPress={onNew}><Text style={styles.fabText}>＋</Text></TouchableOpacity>
  </View>;
}

function NewMessage({onDone}:{onDone:()=>void}) {
  const [peer,setPeer]=useState("");
  const [text,setText]=useState("");
  const { addMessage } = useNexChatStore();
  return <View style={{flex:1}}>
    <Header title="New message" subtitle="No phone number required" />
    <View style={{padding:16,gap:12}}>
      <Text style={styles.label}>NexChat ID or contact</Text>
      <TextInput value={peer} onChangeText={setPeer} placeholder="N-4827-9153-64" style={styles.input}/>
      <Text style={styles.label}>Message</Text>
      <TextInput value={text} onChangeText={setText} placeholder="Write something…" multiline style={[styles.input,{height:120,textAlignVertical:"top"}]}/>
      <TouchableOpacity style={styles.primary} onPress={async()=>{
        if(!peer.trim() || !text.trim()) return Alert.alert("Missing information","Enter a contact and message.");
        await addMessage({peer,text,status:"Queued locally"});
        onDone();
      }}><Text style={styles.primaryText}>Send locally</Text></TouchableOpacity>
      <Text style={styles.note}>Offline first: delivery can be queued until a compatible route is available.</Text>
    </View>
  </View>;
}

function Discover() {
  return <View style={{flex:1}}>
    <Header title="Discover" subtitle="Public content without opening your private vault" />
    <FlatList contentContainerStyle={{padding:16,gap:12}} data={[
      ["NexChat Welcome","A starter space for new users. Replace this with curated/public content."],
      ["Privacy Basics","Your private messages are not the feed. Public discovery is a separate surface."],
      ["Share into NexChat","Use the operating system share sheet to explicitly import links or media."]
    ]} renderItem={({item})=><View style={styles.post}><Text style={styles.cardTitle}>{item[0]}</Text><Text style={styles.cardBody}>{item[1]}</Text><Text style={styles.tag}>STARTER CONTENT</Text></View>}/>
  </View>;
}

function Calls() {
  return <View style={{flex:1}}><Header title="Calls" subtitle="Voice and video transport" />
    <Empty title="Calls are ready for the transport layer" body="The UI is separated from the network transport so local, relay and future P2P routes can share one call interface." action="Open security settings"/>
  </View>;
}

function Vault() {
  const { vaultBytes } = useNexChatStore();
  return <View style={{flex:1}}><Header title="Vault" subtitle="Private device storage" />
    <View style={{padding:16,gap:12}}>
      <View style={styles.stat}><Text style={styles.cardTitle}>Encrypted local payload</Text><Text style={styles.statValue}>{vaultBytes} bytes</Text></View>
      <View style={styles.stat}><Text style={styles.cardTitle}>Cache</Text><Text style={styles.cardBody}>Thumbnails, previews and temporary transfer data can be cleared without deleting your vault.</Text></View>
      <TouchableOpacity style={styles.secondary} onPress={()=>Alert.alert("Vault","Production SQLCipher/native storage adapter is planned for the development build.")}><Text style={styles.secondaryText}>Storage architecture</Text></TouchableOpacity>
    </View>
  </View>;
}

function Settings({identity,onReset}:{identity:Identity;onReset:()=>void}) {
  const [bio,setBio]=useState(false);
  const [guest,setGuest]=useState(identity.guest);
  return <View style={{flex:1}}><Header title="Settings" subtitle="Control your identity, device and data" />
    <FlatList contentContainerStyle={{padding:16,gap:10}} data={[
      {title:"Your NexChat ID",body:identity.id},
      {title:"Recovery Kit",body:"Generate and export a recovery package before trusting additional devices."},
      {title:"Trusted devices",body:"Review and revoke devices that can access your account."},
      {title:"Remote lock",body:"Lock the account from a trusted device if your phone is stolen."},
      {title:"Data & Privacy",body:"Export data, manage backups, clear cache, or delete local data."}
    ]} renderItem={({item})=><View style={styles.setting}><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.cardBody}>{item.body}</Text></View>}/>
    <View style={{padding:16,gap:10}}>
      <View style={styles.row}><Text style={styles.cardTitle}>Biometric unlock</Text><Switch value={bio} onValueChange={async(v)=>{const r=await LocalAuthentication.hasHardwareAsync(); if(v&&!r){Alert.alert("Unavailable","This device does not expose biometric hardware.");return;} setBio(v);}}/></View>
      <View style={styles.row}><Text style={styles.cardTitle}>Guest mode</Text><Switch value={guest} onValueChange={setGuest}/></View>
      <TouchableOpacity style={styles.danger} onPress={onReset}><Text style={styles.dangerText}>Reset local demo data</Text></TouchableOpacity>
    </View>
  </View>;
}

export default function App(){
  const [tab,setTab]=useState<Tab>("Chats");
  const [newMsg,setNewMsg]=useState(false);
  const [identity,setIdentity]=useState<Identity|null>(null);
  const { hydrate, reset } = useNexChatStore();

  useEffect(()=>{(async()=>{
    await initVault();
    await initIdentity();
    const id=await getIdentity();
    setIdentity(id);
    await hydrate();
  })()},[]);

  const screen = useMemo(()=>{
    if(!identity) return <Empty title="Preparing NexChat Core" body="Initializing local identity and secure storage…"/>;
    if(newMsg) return <NewMessage onDone={()=>setNewMsg(false)}/>;
    if(tab==="Chats") return <Chats onNew={()=>setNewMsg(true)}/>;
    if(tab==="Discover") return <Discover/>;
    if(tab==="Calls") return <Calls/>;
    if(tab==="Vault") return <Vault/>;
    return <Settings identity={identity} onReset={async()=>{await reset(); Alert.alert("Reset","Local demo data cleared.");}}/>;
  },[tab,newMsg,identity]);

  return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content"/>{screen}
    <View style={styles.tabs}>{(["Chats","Discover","Calls","Vault","Settings"] as Tab[]).map(t=>
      <TouchableOpacity key={t} style={styles.tab} onPress={()=>{setNewMsg(false);setTab(t)}}>
        <Text style={[styles.tabText,tab===t&&{color:COLORS.brand,fontWeight:"800"}]}>{t}</Text>
      </TouchableOpacity>)}</View>
  </SafeAreaView>;
}

const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:COLORS.bg},
  header:{padding:16,paddingTop:10,backgroundColor:COLORS.card,borderBottomWidth:1,borderBottomColor:COLORS.line},
  title:{fontSize:22,fontWeight:"800",color:COLORS.ink},
  subtitle:{fontSize:12,color:COLORS.muted,marginTop:2},
  logo:{width:74,height:74,borderRadius:24,backgroundColor:"#E8F3FA",alignItems:"center",justifyContent:"center",position:"relative",borderWidth:1,borderColor:"#C7DFEF"},
  logoN:{fontSize:42,fontWeight:"900",color:COLORS.brand,letterSpacing:-5},
  lock:{position:"absolute",top:18,right:17,width:22,height:22,borderWidth:3,borderColor:COLORS.brand,borderRadius:6,alignItems:"center"},
  lockBody:{position:"absolute",top:8,width:17,height:12,backgroundColor:COLORS.brand,borderRadius:3},
  empty:{flex:1,alignItems:"center",justifyContent:"center",padding:30},
  emptyTitle:{fontSize:23,fontWeight:"800",color:COLORS.ink,marginTop:18,textAlign:"center"},
  emptyBody:{fontSize:14,color:COLORS.muted,textAlign:"center",lineHeight:21,marginTop:8,maxWidth:320},
  primary:{backgroundColor:COLORS.brand,borderRadius:14,paddingVertical:14,paddingHorizontal:18,alignItems:"center",marginTop:16},
  primaryText:{color:"#fff",fontWeight:"800"},
  secondary:{borderWidth:1,borderColor:COLORS.brand,borderRadius:14,padding:14,alignItems:"center"},
  secondaryText:{color:COLORS.brand,fontWeight:"800"},
  danger:{borderWidth:1,borderColor:"#F3B3AE",backgroundColor:"#FFF5F4",borderRadius:14,padding:14,alignItems:"center"},
  dangerText:{color:COLORS.danger,fontWeight:"800"},
  input:{backgroundColor:"#fff",borderWidth:1,borderColor:COLORS.line,borderRadius:14,padding:14,fontSize:16,color:COLORS.ink},
  label:{fontSize:13,fontWeight:"800",color:COLORS.ink},
  note:{fontSize:12,color:COLORS.muted,lineHeight:18},
  chatCard:{backgroundColor:"#fff",borderRadius:16,padding:14,flexDirection:"row",alignItems:"center",gap:12,borderWidth:1,borderColor:COLORS.line},
  avatar:{width:44,height:44,borderRadius:16,backgroundColor:"#DDECF6",alignItems:"center",justifyContent:"center"},
  avatarText:{fontWeight:"900",color:COLORS.brand,fontSize:18},
  cardTitle:{fontWeight:"800",color:COLORS.ink,fontSize:15},
  cardBody:{color:COLORS.muted,fontSize:13,lineHeight:19,marginTop:4},
  time:{fontSize:10,color:COLORS.muted},
  post:{backgroundColor:"#fff",borderRadius:18,padding:16,borderWidth:1,borderColor:COLORS.line},
  tag:{fontSize:10,fontWeight:"800",color:COLORS.brand,marginTop:10},
  stat:{backgroundColor:"#fff",borderRadius:18,padding:16,borderWidth:1,borderColor:COLORS.line},
  statValue:{fontSize:26,fontWeight:"900",color:COLORS.brand,marginTop:6},
  setting:{backgroundColor:"#fff",borderRadius:16,padding:15,borderWidth:1,borderColor:COLORS.line},
  row:{backgroundColor:"#fff",borderRadius:16,padding:14,flexDirection:"row",alignItems:"center",justifyContent:"space-between",borderWidth:1,borderColor:COLORS.line},
  tabs:{height:64,backgroundColor:"#fff",borderTopWidth:1,borderTopColor:COLORS.line,flexDirection:"row"},
  tab:{flex:1,alignItems:"center",justifyContent:"center"},
  tabText:{fontSize:11,color:COLORS.muted},
  fab:{position:"absolute",right:18,bottom:78,width:58,height:58,borderRadius:20,backgroundColor:COLORS.brand,alignItems:"center",justifyContent:"center",elevation:5},
  fabText:{color:"#fff",fontSize:30,lineHeight:30}
});
