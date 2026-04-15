# Flutter WebView Share Integration

This frontend now sends share data in this priority order:

1. Flutter native bridge, when available
2. Browser `navigator.share()`
3. Clipboard copy fallback

The web payload shape is always:

```json
{
  "title": "Example title",
  "text": "Example text",
  "url": "https://example.com/page",
  "message": "Example title\nExample text\nhttps://example.com/page",
  "type": "share"
}
```

Use one of the Flutter integrations below so the website can trigger the real Android/iOS native share sheet.

## Required Flutter package

```yaml
dependencies:
  share_plus: ^10.1.4
  webview_flutter: ^4.10.0
```

For `flutter_inappwebview`:

```yaml
dependencies:
  share_plus: ^10.1.4
  flutter_inappwebview: ^6.1.5
```

## Shared Dart helper

```dart
import 'dart:convert';

import 'package:share_plus/share_plus.dart';

class WebSharePayload {
  final String title;
  final String text;
  final String url;

  const WebSharePayload({
    required this.title,
    required this.text,
    required this.url,
  });

  factory WebSharePayload.fromDynamic(dynamic raw) {
    if (raw is Map) {
      return WebSharePayload(
        title: (raw['title'] ?? '').toString().trim(),
        text: (raw['text'] ?? '').toString().trim(),
        url: (raw['url'] ?? '').toString().trim(),
      );
    }

    if (raw is String && raw.trim().isNotEmpty) {
      try {
        final decoded = jsonDecode(raw);
        if (decoded is Map) {
          return WebSharePayload.fromDynamic(decoded);
        }
      } catch (_) {
        final lines = raw
            .split('\n')
            .map((line) => line.trim())
            .where((line) => line.isNotEmpty)
            .toList();

        return WebSharePayload(
          title: lines.isNotEmpty ? lines.first : '',
          text: lines.length > 1 ? lines.sublist(1).join('\n') : '',
          url: '',
        );
      }
    }

    return const WebSharePayload(title: '', text: '', url: '');
  }

  String toShareText() {
    return [title, text, url].where((value) => value.isNotEmpty).join('\n');
  }
}

Future<bool> openNativeShare(dynamic rawPayload) async {
  final payload = WebSharePayload.fromDynamic(rawPayload);
  final shareText = payload.toShareText();

  if (shareText.isEmpty) {
    return false;
  }

  await SharePlus.instance.share(
    ShareParams(
      text: shareText,
      title: payload.title.isNotEmpty ? payload.title : null,
      subject: payload.title.isNotEmpty ? payload.title : null,
    ),
  );

  return true;
}
```

## `webview_flutter` example

```dart
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

class TastizoWebViewPage extends StatefulWidget {
  const TastizoWebViewPage({super.key});

  @override
  State<TastizoWebViewPage> createState() => _TastizoWebViewPageState();
}

class _TastizoWebViewPageState extends State<TastizoWebViewPage> {
  late final WebViewController _controller;

  @override
  void initState() {
    super.initState();

    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.white)
      ..addJavaScriptChannel(
        'ShareChannel',
        onMessageReceived: (message) async {
          await openNativeShare(message.message);
        },
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageFinished: (_) async {
            await _controller.runJavaScript('window.__TASTIZO_FLUTTER_WEBVIEW__ = true;');
          },
        ),
      )
      ..loadRequest(Uri.parse('https://your-domain.example'));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: WebViewWidget(controller: _controller),
      ),
    );
  }
}
```

Notes:

- The website posts to `window.ShareChannel.postMessage(...)`.
- `JavaScriptMode.unrestricted` is required.
- `window.__TASTIZO_FLUTTER_WEBVIEW__ = true` is optional, but helps explicit environment detection.

## `flutter_inappwebview` example

```dart
import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

class TastizoInAppWebViewPage extends StatefulWidget {
  const TastizoInAppWebViewPage({super.key});

  @override
  State<TastizoInAppWebViewPage> createState() => _TastizoInAppWebViewPageState();
}

class _TastizoInAppWebViewPageState extends State<TastizoInAppWebViewPage> {
  InAppWebViewController? _controller;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: InAppWebView(
          initialSettings: InAppWebViewSettings(
            javaScriptEnabled: true,
            javaScriptCanOpenWindowsAutomatically: false,
            mediaPlaybackRequiresUserGesture: false,
          ),
          initialUrlRequest: URLRequest(
            url: WebUri('https://your-domain.example'),
          ),
          onWebViewCreated: (controller) {
            _controller = controller;

            controller.addJavaScriptHandler(
              handlerName: 'share',
              callback: (args) async {
                final payload = args.isNotEmpty ? args.first : null;
                final success = await openNativeShare(payload);
                return {'success': success};
              },
            );
          },
          onLoadStop: (controller, _) async {
            await controller.evaluateJavascript(
              source: 'window.__TASTIZO_FLUTTER_WEBVIEW__ = true;',
            );
          },
        ),
      ),
    );
  }
}
```

Notes:

- The web app first tries `window.flutter_inappwebview.callHandler('share', payload)`.
- Returning `{ "success": true }` tells the website that native share opened successfully.

## Required WebView behavior

- Enable JavaScript.
- Keep the share action inside the web button tap flow.
- Do not intercept the share request and replace it with clipboard copy.
- Do not open a blank page or external browser for share.

## Final fallback flow

1. If Flutter bridge exists, the website sends `{ title, text, url }` to Flutter.
2. Flutter uses `share_plus` to open the native Android/iOS share sheet.
3. If no Flutter bridge exists, the website uses `navigator.share()` in the same button click.
4. If native share is unavailable or fails, the website copies the URL and shows `Link copied`.
