import test from 'node:test';import assert from 'node:assert/strict';
import {arrangeConversations,conversationGroup} from '../conversation-order.mjs';
const stamp='2026-10-15T01:00:00Z';
const row=(id,rank,time=null,extra={})=>({id,kind:'chatgpt',sidebarRank:rank,browserObservedAt:stamp,updatedAt:time,...extra});
test('unknown dates remain between their Chrome neighbors without inventing a timestamp',()=>{const rows=arrangeConversations([row('c',2,1791990000),row('b',1),row('a',0,1791991000)]);assert.deepEqual(rows.map(t=>t.id),['a','b','c']);assert.equal(rows[1].updatedAt,null);assert.match(conversationGroup(rows[1]),/추정 날짜/)});
test('contradictory old dates never reorder the browser or produce an estimate',()=>{const rows=arrangeConversations([row('a',0,1000),row('b',1),row('c',2,2000)]);assert.deepEqual(rows.map(t=>t.id),['a','b','c']);assert.equal(rows[1].inferredDateLabel,undefined)});
test('pinned-only and older unseen records remain searchable without mixing incomparable ranks',()=>{const rows=arrangeConversations([row('old',0,null,{browserObservedAt:'2026-10-14T01:00:00Z'}),row('pin',null,2000,{pinned:true}),row('new',0)]);assert.deepEqual(rows.map(t=>t.id),['new','old','pin']);assert.equal(rows[2].placement,'saved');assert.equal(rows[0].inferredDateLabel,undefined)});
test('different anchor days are shown as a range, not a made-up day',()=>{const rows=arrangeConversations([row('a',0,1791991000),row('b',1),row('c',2,1791700000)]);assert.match(rows[1].inferredDateLabel,/ ~ .*사이/)});
