# Application Integration Guide

This document provides implementation guides for integrating the Anime Scraper API into mobile and web applications.

---

## Table of Contents

- [Flutter Integration](#flutter-integration)
- [React/Next.js Integration](#reactnextjs-integration)
- [Android Native Integration](#android-native-integration)
- [iOS Native Integration](#ios-native-integration)
- [API Response Examples](#api-response-examples)

---

## Flutter Integration

### Prerequisites

Add dependencies to `pubspec.yaml`:

```yaml
dependencies:
  http: ^1.2.0
  video_player: ^2.8.0
  # Optional: for better video player UI
  chewie: ^1.7.0
```

### 1. API Service Layer

Create `lib/services/anime_api_service.dart`:

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

class AnimeApiService {
  static const String baseUrl = 'http://your-server-ip:3000';
  
  // Fetch home page anime list
  Future<List<Anime>> getHomeAnime() async {
    final response = await http.get(Uri.parse('$baseUrl/api/home'));
    
    if (response.statusCode == 200) {
      final List<dynamic> data = json.decode(response.body);
      return data.map((json) => Anime.fromJson(json)).toList();
    } else {
      throw Exception('Failed to load anime list');
    }
  }
  
  // Fetch anime details with episodes
  Future<AnimeDetail> getAnimeDetail(int malId) async {
    final response = await http.get(
      Uri.parse('$baseUrl/api/anime/$malId')
    );
    
    if (response.statusCode == 200) {
      return AnimeDetail.fromJson(json.decode(response.body));
    } else {
      throw Exception('Failed to load anime details');
    }
  }
  
  // Fetch streaming sources for specific episode
  Future<StreamingResponse> getStreamingSources(int malId, int episode) async {
    final response = await http.get(
      Uri.parse('$baseUrl/api/streaming/$malId/$episode')
    );
    
    if (response.statusCode == 200) {
      return StreamingResponse.fromJson(json.decode(response.body));
    } else {
      throw Exception('Failed to load streaming sources');
    }
  }
  
  // Build video proxy URL for playback
  String buildProxyUrl(String videoUrl) {
    final encodedUrl = Uri.encodeComponent(videoUrl);
    return '$baseUrl/api/video-proxy?url=$encodedUrl';
  }
}
```

### 2. Data Models

Create `lib/models/anime_models.dart`:

```dart
class Anime {
  final String slug;
  final String animename;
  final String coverurl;
  
  Anime({
    required this.slug,
    required this.animename,
    required this.coverurl,
  });
  
  factory Anime.fromJson(Map<String, dynamic> json) {
    return Anime(
      slug: json['slug'] as String,
      animename: json['animename'] as String,
      coverurl: json['coverurl'] as String,
    );
  }
}

class AnimeDetail {
  final int malId;
  final String title;
  final String? samehadakuSlug;
  final String? animasuSlug;
  final List<Episode> episodes;
  
  AnimeDetail({
    required this.malId,
    required this.title,
    this.samehadakuSlug,
    this.animasuSlug,
    required this.episodes,
  });
  
  factory AnimeDetail.fromJson(Map<String, dynamic> json) {
    return AnimeDetail(
      malId: json['mal_id'] as int,
      title: json['title'] as String,
      samehadakuSlug: json['samehadaku_slug'] as String?,
      animasuSlug: json['animasu_slug'] as String?,
      episodes: (json['episodes'] as List)
          .map((e) => Episode.fromJson(e))
          .toList(),
    );
  }
}

class Episode {
  final int episodeNumber;
  final String? title;
  final String? releasedDate;
  final String provider;
  
  Episode({
    required this.episodeNumber,
    this.title,
    this.releasedDate,
    required this.provider,
  });
  
  factory Episode.fromJson(Map<String, dynamic> json) {
    return Episode(
      episodeNumber: json['episode_number'] as int,
      title: json['title'] as String?,
      releasedDate: json['released_date'] as String?,
      provider: json['provider'] as String,
    );
  }
}

class StreamingResponse {
  final int malId;
  final int episode;
  final List<StreamingSource> sources;
  
  StreamingResponse({
    required this.malId,
    required this.episode,
    required this.sources,
  });
  
  factory StreamingResponse.fromJson(Map<String, dynamic> json) {
    return StreamingResponse(
      malId: json['mal_id'] as int,
      episode: json['episode'] as int,
      sources: (json['sources'] as List)
          .map((s) => StreamingSource.fromJson(s))
          .toList(),
    );
  }
}

class StreamingSource {
  final String provider;
  final String url;
  final String? urlVideo;
  final String resolution;
  final String? server;
  
  StreamingSource({
    required this.provider,
    required this.url,
    this.urlVideo,
    required this.resolution,
    this.server,
  });
  
  factory StreamingSource.fromJson(Map<String, dynamic> json) {
    return StreamingSource(
      provider: json['provider'] as String,
      url: json['url'] as String,
      urlVideo: json['url_video'] as String?,
      resolution: json['resolution'] as String,
      server: json['server'] as String?,
    );
  }
  
  // Check if this source has direct video URL
  bool get hasDirectUrl => urlVideo != null && urlVideo!.isNotEmpty;
}
```

### 3. Video Player Widget

Create `lib/widgets/anime_video_player.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';
import '../services/anime_api_service.dart';
import '../models/anime_models.dart';

class AnimeVideoPlayer extends StatefulWidget {
  final StreamingSource source;
  final AnimeApiService apiService;
  
  const AnimeVideoPlayer({
    Key? key,
    required this.source,
    required this.apiService,
  }) : super(key: key);
  
  @override
  State<AnimeVideoPlayer> createState() => _AnimeVideoPlayerState();
}

class _AnimeVideoPlayerState extends State<AnimeVideoPlayer> {
  late VideoPlayerController _controller;
  bool _isInitialized = false;
  String? _errorMessage;
  
  @override
  void initState() {
    super.initState();
    _initializePlayer();
  }
  
  Future<void> _initializePlayer() async {
    if (!widget.source.hasDirectUrl) {
      setState(() {
        _errorMessage = 'This source does not have a direct video URL';
      });
      return;
    }
    
    try {
      // Build proxy URL
      final proxyUrl = widget.apiService.buildProxyUrl(widget.source.urlVideo!);
      
      // Initialize video player
      _controller = VideoPlayerController.networkUrl(Uri.parse(proxyUrl));
      
      await _controller.initialize();
      
      setState(() {
        _isInitialized = true;
      });
      
      // Auto-play
      _controller.play();
    } catch (e) {
      setState(() {
        _errorMessage = 'Failed to load video: $e';
      });
    }
  }
  
  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }
  
  @override
  Widget build(BuildContext context) {
    if (_errorMessage != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Text(
            _errorMessage!,
            style: const TextStyle(color: Colors.red),
            textAlign: TextAlign.center,
          ),
        ),
      );
    }
    
    if (!_isInitialized) {
      return const Center(
        child: CircularProgressIndicator(),
      );
    }
    
    return AspectRatio(
      aspectRatio: _controller.value.aspectRatio,
      child: Stack(
        alignment: Alignment.bottomCenter,
        children: [
          VideoPlayer(_controller),
          VideoProgressIndicator(
            _controller,
            allowScrubbing: true,
            colors: VideoProgressColors(
              playedColor: Theme.of(context).primaryColor,
              bufferedColor: Colors.grey,
              backgroundColor: Colors.black26,
            ),
          ),
          _buildControls(),
        ],
      ),
    );
  }
  
  Widget _buildControls() {
    return Container(
      color: Colors.black26,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          IconButton(
            onPressed: () {
              setState(() {
                _controller.value.isPlaying
                    ? _controller.pause()
                    : _controller.play();
              });
            },
            icon: Icon(
              _controller.value.isPlaying ? Icons.pause : Icons.play_arrow,
              color: Colors.white,
            ),
          ),
          Text(
            '${_formatDuration(_controller.value.position)} / ${_formatDuration(_controller.value.duration)}',
            style: const TextStyle(color: Colors.white),
          ),
          IconButton(
            onPressed: () {
              setState(() {
                _controller.value.volume == 0
                    ? _controller.setVolume(1.0)
                    : _controller.setVolume(0);
              });
            },
            icon: Icon(
              _controller.value.volume == 0
                  ? Icons.volume_off
                  : Icons.volume_up,
              color: Colors.white,
            ),
          ),
        ],
      ),
    );
  }
  
  String _formatDuration(Duration duration) {
    String twoDigits(int n) => n.toString().padLeft(2, '0');
    final minutes = twoDigits(duration.inMinutes.remainder(60));
    final seconds = twoDigits(duration.inSeconds.remainder(60));
    return '$minutes:$seconds';
  }
}
```

### 4. Episode Player Screen

Create `lib/screens/episode_player_screen.dart`:

```dart
import 'package:flutter/material.dart';
import '../services/anime_api_service.dart';
import '../models/anime_models.dart';
import '../widgets/anime_video_player.dart';

class EpisodePlayerScreen extends StatefulWidget {
  final int malId;
  final int episode;
  
  const EpisodePlayerScreen({
    Key? key,
    required this.malId,
    required this.episode,
  }) : super(key: key);
  
  @override
  State<EpisodePlayerScreen> createState() => _EpisodePlayerScreenState();
}

class _EpisodePlayerScreenState extends State<EpisodePlayerScreen> {
  final AnimeApiService _apiService = AnimeApiService();
  StreamingResponse? _streamingResponse;
  StreamingSource? _selectedSource;
  bool _isLoading = true;
  String? _errorMessage;
  
  @override
  void initState() {
    super.initState();
    _loadStreamingSources();
  }
  
  Future<void> _loadStreamingSources() async {
    try {
      final response = await _apiService.getStreamingSources(
        widget.malId,
        widget.episode,
      );
      
      setState(() {
        _streamingResponse = response;
        // Auto-select first source with direct URL
        _selectedSource = response.sources.firstWhere(
          (s) => s.hasDirectUrl,
          orElse: () => response.sources.first,
        );
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _errorMessage = e.toString();
        _isLoading = false;
      });
    }
  }
  
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Episode ${widget.episode}'),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorMessage != null
              ? Center(child: Text(_errorMessage!))
              : Column(
                  children: [
                    if (_selectedSource != null)
                      AnimeVideoPlayer(
                        source: _selectedSource!,
                        apiService: _apiService,
                      ),
                    const SizedBox(height: 16),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Text(
                        'Select Quality',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                    ),
                    Expanded(
                      child: _buildSourceList(),
                    ),
                  ],
                ),
    );
  }
  
  Widget _buildSourceList() {
    final sources = _streamingResponse?.sources ?? [];
    
    return ListView.builder(
      itemCount: sources.length,
      itemBuilder: (context, index) {
        final source = sources[index];
        final isSelected = _selectedSource == source;
        
        return ListTile(
          selected: isSelected,
          leading: Icon(
            source.hasDirectUrl ? Icons.check_circle : Icons.warning,
            color: source.hasDirectUrl ? Colors.green : Colors.orange,
          ),
          title: Text('${source.provider} - ${source.resolution}'),
          subtitle: Text(
            source.hasDirectUrl
                ? 'Direct URL Available'
                : 'Embed Only (may not work)',
          ),
          trailing: source.server != null ? Text('Server ${source.server}') : null,
          onTap: () {
            setState(() {
              _selectedSource = source;
            });
          },
        );
      },
    );
  }
}
```

### 5. Usage Example

```dart
import 'package:flutter/material.dart';
import 'screens/episode_player_screen.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({Key? key}) : super(key: key);
  
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Anime Player',
      theme: ThemeData(
        primarySwatch: Colors.blue,
      ),
      home: const EpisodePlayerScreen(
        malId: 21,
        episode: 1,
      ),
    );
  }
}
```

---

## Important Notes for Flutter

### Network Security Configuration (Android)

For HTTP connections, add to `android/app/src/main/AndroidManifest.xml`:

```xml
<application
    android:usesCleartextTraffic="true"
    ...>
```

Or use HTTPS in production.

### iOS Configuration

Add to `ios/Runner/Info.plist`:

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
</dict>
```

### Video Playback Issues

If video doesn't play:

1. **Check Network:** Ensure device can reach API server
2. **Check Logs:** Use `debugPrint()` to log proxy URLs
3. **Test Proxy URL:** Open proxy URL in browser to verify
4. **Check Source:** Only sources with `url_video` field work
5. **Try Different Source:** Some sources may be expired

### Optimization Tips

1. **Cache Video URLs:** Store `url_video` for 10-15 minutes
2. **Preload Sources:** Fetch streaming sources before player screen
3. **Background Playback:** Use `audio_service` package
4. **Picture-in-Picture:** Use `floating` package
5. **Offline Support:** Download videos using `dio` + `path_provider`

---

## React/Next.js Integration

### Installation

```bash
npm install axios
```

### API Service

```typescript
// lib/animeApi.ts
import axios from 'axios';

const API_BASE = 'http://your-server-ip:3000';

export interface StreamingSource {
  provider: string;
  url: string;
  url_video: string | null;
  resolution: string;
  server?: string;
}

export interface StreamingResponse {
  mal_id: number;
  episode: number;
  sources: StreamingSource[];
}

export const animeApi = {
  async getStreamingSources(malId: number, episode: number): Promise<StreamingResponse> {
    const { data } = await axios.get(`${API_BASE}/api/streaming/${malId}/${episode}`);
    return data;
  },
  
  buildProxyUrl(videoUrl: string): string {
    return `${API_BASE}/api/video-proxy?url=${encodeURIComponent(videoUrl)}`;
  }
};
```

### Video Player Component

```typescript
// components/VideoPlayer.tsx
'use client';

import { useEffect, useRef } from 'react';
import { animeApi } from '@/lib/animeApi';

interface Props {
  source: StreamingSource;
}

export function VideoPlayer({ source }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  
  if (!source.url_video) {
    return <div>No direct video URL available</div>;
  }
  
  const proxyUrl = animeApi.buildProxyUrl(source.url_video);
  
  return (
    <video
      ref={videoRef}
      controls
      autoPlay
      className="w-full max-h-[600px] bg-black"
    >
      <source src={proxyUrl} type="video/mp4" />
      Your browser does not support the video tag.
    </video>
  );
}
```

---

## API Response Examples

### GET /api/streaming/:mal_id/:episode

```json
{
  "mal_id": 21,
  "episode": 1,
  "sources": [
    {
      "provider": "animasu",
      "url": "https://www.blogger.com/video.g?token=AD6v5dz...",
      "url_video": "https://rr6---sn-2uuxa3vh-230s.googlevideo.com/videoplayback?expire=1770068800&...",
      "resolution": "480p",
      "server": "1"
    },
    {
      "provider": "samehadaku",
      "url": "https://example.com/embed/xyz",
      "url_video": null,
      "resolution": "360p"
    }
  ]
}
```

### Video Proxy Usage

```
GET /api/video-proxy?url={encoded_video_url}

Response: Binary MP4 stream
Content-Type: video/mp4
Accept-Ranges: bytes
```

---

## Troubleshooting

### Common Issues

1. **CORS Error**
   - Ensure CORS is enabled on API server
   - Check browser console for details

2. **Video Not Playing**
   - Only sources with `url_video` field work
   - Check if URL is expired (valid ~8 hours)
   - Try different source/resolution

3. **Slow Loading**
   - Video proxy streams directly (no buffering)
   - Network speed affects playback
   - Try lower resolution

4. **IP Validation Error**
   - Must use `/api/video-proxy` endpoint
   - Direct access to `url_video` will fail (403)
   - This is expected behavior

---

## Support

For issues or questions, please check:
- Main README.md for API documentation
- GitHub Issues for known problems
- API server logs for debugging
