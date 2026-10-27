const positive=value=>Number.isFinite(value)&&value>0?value:null;
// Message observations describe loaded user messages, never the whole chat's update time.
export function conversationDate(row,basis='activity'){
 const created=positive(row.createdAt),updated=positive(row.updatedAt),message=positive(row.lastMessageAt);
 if(basis==='created')return {timestamp:created,label:'대화 시작일',source:'created'};
 if(basis==='updated')return {timestamp:updated,label:'마지막 수정일',source:'updated'};
 const latest=Math.max(created||0,updated||0,message||0);
 if(!latest)return {timestamp:null,label:'날짜 미확인',source:'unknown'};
 if(latest===updated)return {timestamp:updated,label:'마지막 수정일',source:'updated'};
 if(latest===message)return {timestamp:message,label:'불러온 내 메시지 중 최근 시각 · 대화 전체의 마지막 수정일은 아닙니다',source:'message'};
 return {timestamp:created,label:'대화 시작일 기준 · 마지막 수정일 미확인',source:'created'};
}
