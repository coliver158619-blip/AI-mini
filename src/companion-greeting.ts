// Older server snapshots may still contain operational status instead of a greeting.
export function companionGreeting(text?:string) {
 return !text || /记录|刷新|缓存|检测|数据更新|系统推送/.test(text)
  ? '你来啦，今天过得怎么样？陪你听会儿歌，慢慢聊。'
  : text;
}
