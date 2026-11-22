// The user guide in the search field of the macOS Help menu.
//
// macOS searches only the menu items there, unless the app registers a search handler (NSUserInterfaceItemSearching): its results
// are listed as "Help Topics". This handler searches the sections of the user guide (given from JavaScript, see
// src/main/helpSearch.mjs) and, when the user picks one, tells JavaScript which section to open in the app's own User Guide window.
//
// Node-API only (no V8 / Electron headers): the module is ABI-stable and does not have to be rebuilt for a new Electron.
// Built by scripts/build-native.mjs (clang, universal arm64 + x86_64).

#define NAPI_VERSION 8
#import <Cocoa/Cocoa.h>
#include <node_api.h>
#include <stdlib.h>
#include <string.h>

static napi_threadsafe_function gAction = NULL; // calls the JavaScript callback on the main thread with "help:open:<file>#<id>" / "help:search:<text>"

static void Send(NSString *action) {
  if (!gAction || !action) return;
  char *copy = strdup(action.UTF8String);
  if (napi_call_threadsafe_function(gAction, copy, napi_tsfn_nonblocking) != napi_ok) free(copy);
}

@interface StudioHelpSearch : NSObject <NSUserInterfaceItemSearching>
@property(atomic, copy) NSArray<NSDictionary<NSString *, NSString *> *> *entries; // { key, title, chapter, text }
@property(atomic, copy) NSDictionary<NSString *, NSString *> *titles;              // key -> the title shown in Help Topics
@property(atomic, copy) NSSet<NSString *> *stop;                                   // common words left out of a query
@end

@implementation StudioHelpSearch

// The words of a query: two letters or more, without the common ones (unless nothing else is left).
- (NSArray<NSString *> *)wordsOf:(NSString *)query {
  NSMutableArray *all = [NSMutableArray array], *kept = [NSMutableArray array];
  NSString *folded = [query stringByFoldingWithOptions:NSCaseInsensitiveSearch | NSDiacriticInsensitiveSearch locale:nil];
  for (NSString *w in [folded componentsSeparatedByCharactersInSet:NSCharacterSet.alphanumericCharacterSet.invertedSet]) {
    if (w.length < 2 || [all containsObject:w]) continue;
    [all addObject:w];
    if (![self.stop containsObject:w]) [kept addObject:w];
  }
  return kept.count ? kept : all;
}

// Called on a background thread while the user types. A section matches when it contains every word; the words in its heading
// weigh the most, then in the chapter's title, then the phrase as typed.
- (void)searchForItemsWithSearchString:(NSString *)searchString
                           resultLimit:(NSInteger)resultLimit
                    matchedItemHandler:(void (^)(NSArray *items))handleMatchedItems {
  NSArray *entries = self.entries;
  NSArray<NSString *> *words = [self wordsOf:searchString];
  if (!words.count || !entries.count) { handleMatchedItems(@[]); return; }
  const NSStringCompareOptions opts = NSCaseInsensitiveSearch | NSDiacriticInsensitiveSearch;
  NSString *phrase = [searchString stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
  NSMutableArray<NSArray *> *found = [NSMutableArray array]; // [score, order, key]
  NSUInteger order = 0;
  for (NSDictionary *e in entries) {
    order++;
    NSString *title = e[@"title"] ?: @"", *chapter = e[@"chapter"] ?: @"", *text = e[@"text"] ?: @"";
    NSInteger score = 0;
    BOOL all = YES;
    for (NSString *w in words) {
      BOOL inTitle = [title rangeOfString:w options:opts].location != NSNotFound;
      BOOL inChapter = [chapter rangeOfString:w options:opts].location != NSNotFound;
      BOOL inText = [text rangeOfString:w options:opts].location != NSNotFound;
      if (!inTitle && !inChapter && !inText) { all = NO; break; }
      score += inTitle ? 10 : inChapter ? 3 : 1;
    }
    if (!all) continue;
    if (words.count > 1 && ([title rangeOfString:phrase options:opts].location != NSNotFound || [text rangeOfString:phrase options:opts].location != NSNotFound)) score += 8;
    [found addObject:@[ @(score), @(order), e[@"key"] ?: @"" ]];
  }
  [found sortUsingComparator:^NSComparisonResult(NSArray *a, NSArray *b) {
    NSComparisonResult r = [b[0] compare:a[0]];
    return r != NSOrderedSame ? r : [a[1] compare:b[1]];
  }];
  NSMutableArray *items = [NSMutableArray array];
  for (NSArray *f in found) {
    if ((NSInteger)items.count >= resultLimit) break;
    [items addObject:f[2]];
  }
  handleMatchedItems(items);
}

- (NSArray<NSString *> *)localizedTitlesForItem:(id)item {
  NSString *t = self.titles[item];
  return t ? @[ t ] : @[];
}

- (void)performActionForItem:(id)item {
  Send([@"help:open:" stringByAppendingString:item]);
}

- (void)showAllHelpTopicsForSearchString:(NSString *)searchString {
  Send([@"help:search:" stringByAppendingString:searchString ?: @""]);
}

@end

static StudioHelpSearch *gHandler = nil;

// ---------- Node-API ----------

static NSString *StringOf(napi_env env, napi_value v) {
  size_t len = 0;
  if (napi_get_value_string_utf8(env, v, NULL, 0, &len) != napi_ok) return nil;
  char *buf = (char *)malloc(len + 1);
  napi_get_value_string_utf8(env, v, buf, len + 1, &len);
  NSString *s = [[NSString alloc] initWithBytes:buf length:len encoding:NSUTF8StringEncoding];
  free(buf);
  return s;
}

static NSString *Prop(napi_env env, napi_value obj, const char *name) {
  napi_value v;
  napi_valuetype t;
  if (napi_get_named_property(env, obj, name, &v) != napi_ok || napi_typeof(env, v, &t) != napi_ok || t != napi_string) return nil;
  return StringOf(env, v);
}

static void CallJs(napi_env env, napi_value js_cb, void *context, void *data) {
  char *text = (char *)data;
  if (env && js_cb) {
    napi_value undefined, arg;
    napi_get_undefined(env, &undefined);
    napi_create_string_utf8(env, text, NAPI_AUTO_LENGTH, &arg);
    napi_call_function(env, undefined, js_cb, 1, &arg, NULL);
  }
  free(text);
}

static napi_value Throw(napi_env env, const char *msg) {
  napi_throw_error(env, NULL, msg);
  return NULL;
}

// install(entries: [{ key, title, chapter, text }], stop: string[], onAction: (action) => void) → true.
// Again with new entries: the index is replaced (the callback of the first call stays).
static napi_value Install(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value argv[3];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  if (argc < 3) return Throw(env, "install(entries, stop, onAction)");
  bool isArray = false;
  napi_is_array(env, argv[0], &isArray);
  if (!isArray) return Throw(env, "entries must be an array");

  uint32_t n = 0;
  napi_get_array_length(env, argv[0], &n);
  NSMutableArray *entries = [NSMutableArray arrayWithCapacity:n];
  NSMutableDictionary *titles = [NSMutableDictionary dictionaryWithCapacity:n];
  for (uint32_t i = 0; i < n; i++) {
    napi_value e;
    napi_get_element(env, argv[0], i, &e);
    NSString *key = Prop(env, e, "key"), *title = Prop(env, e, "title");
    if (!key.length || !title.length) continue;
    NSString *chapter = Prop(env, e, "chapter") ?: @"", *text = Prop(env, e, "text") ?: @"", *label = Prop(env, e, "label") ?: title;
    [entries addObject:@{ @"key" : key, @"title" : title, @"chapter" : chapter, @"text" : text }];
    titles[key] = label;
  }
  NSMutableSet *stop = [NSMutableSet set];
  napi_is_array(env, argv[1], &isArray);
  if (isArray) {
    uint32_t m = 0;
    napi_get_array_length(env, argv[1], &m);
    for (uint32_t i = 0; i < m; i++) {
      napi_value w;
      napi_get_element(env, argv[1], i, &w);
      NSString *s = StringOf(env, w);
      if (s.length) [stop addObject:s.lowercaseString];
    }
  }

  if (!gAction) {
    napi_value name;
    napi_create_string_utf8(env, "helpSearchAction", NAPI_AUTO_LENGTH, &name);
    if (napi_create_threadsafe_function(env, argv[2], NULL, name, 0, 1, NULL, NULL, NULL, CallJs, &gAction) != napi_ok) return Throw(env, "the callback could not be kept");
    napi_unref_threadsafe_function(env, gAction); // it must not keep the app running
  }
  if (!gHandler) gHandler = [StudioHelpSearch new];
  gHandler.stop = stop;
  gHandler.titles = titles;
  gHandler.entries = entries;
  static BOOL registered = NO;
  if (!registered) {
    if (!NSApp) return Throw(env, "NSApplication is not running yet (call after app ready)");
    [NSApp registerUserInterfaceItemSearchHandler:gHandler];
    registered = YES;
  }
  napi_value ok;
  napi_get_boolean(env, true, &ok);
  return ok;
}

NAPI_MODULE_INIT() {
  napi_value fn;
  napi_create_function(env, "install", NAPI_AUTO_LENGTH, Install, NULL, &fn);
  napi_set_named_property(env, exports, "install", fn);
  return exports;
}
