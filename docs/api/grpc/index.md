---
sidebar_position: 1
---

# gRPC API

QuckApp uses gRPC for high-performance internal service communication. This documentation covers the public-facing gRPC endpoints available for client applications.

## Connection

### Endpoint

```
grpc.QuckApp.dev:443
```

### Authentication

Include JWT token in metadata:

```javascript
const metadata = new grpc.Metadata();
metadata.add('authorization', 'Bearer <jwt>');
```

## Protocol Buffers

### Common Types

```protobuf
// common.proto
syntax = "proto3";

package QuckApp.common;

message Timestamp {
  int64 seconds = 1;
  int32 nanos = 2;
}

message UUID {
  string value = 1;
}

message Pagination {
  int32 limit = 1;
  string cursor = 2;
}

message PaginatedResponse {
  string next_cursor = 1;
  bool has_more = 2;
  int32 total = 3;
}
```

### User Service

```protobuf
// user.proto
syntax = "proto3";

package QuckApp.user;

service UserService {
  rpc GetUser(GetUserRequest) returns (User);
  rpc GetUsers(GetUsersRequest) returns (GetUsersResponse);
  rpc UpdateProfile(UpdateProfileRequest) returns (User);
  rpc SearchUsers(SearchUsersRequest) returns (SearchUsersResponse);
}

message User {
  string id = 1;
  string email = 2;
  string display_name = 3;
  string avatar_url = 4;
  string status = 5;
  string status_text = 6;
  int64 created_at = 7;
}

message GetUserRequest {
  string user_id = 1;
}

message GetUsersRequest {
  repeated string user_ids = 1;
}

message GetUsersResponse {
  repeated User users = 1;
}

message UpdateProfileRequest {
  string display_name = 1;
  string avatar_url = 2;
  string status_text = 3;
}

message SearchUsersRequest {
  string query = 1;
  string workspace_id = 2;
  int32 limit = 3;
}

message SearchUsersResponse {
  repeated User users = 1;
}
```

### Message Service

```protobuf
// message.proto
syntax = "proto3";

package QuckApp.message;

service MessageService {
  rpc SendMessage(SendMessageRequest) returns (Message);
  rpc GetMessages(GetMessagesRequest) returns (GetMessagesResponse);
  rpc EditMessage(EditMessageRequest) returns (Message);
  rpc DeleteMessage(DeleteMessageRequest) returns (DeleteMessageResponse);
  rpc StreamMessages(StreamMessagesRequest) returns (stream Message);
}

message Message {
  string id = 1;
  string channel_id = 2;
  string user_id = 3;
  string content = 4;
  repeated Attachment attachments = 5;
  repeated string mentions = 6;
  int64 created_at = 7;
  int64 edited_at = 8;
  string thread_id = 9;
  int32 reply_count = 10;
}

message Attachment {
  string id = 1;
  string type = 2;
  string url = 3;
  string filename = 4;
  int64 size = 5;
}

message SendMessageRequest {
  string channel_id = 1;
  string content = 2;
  repeated string attachment_ids = 3;
  string thread_id = 4;
}

message GetMessagesRequest {
  string channel_id = 1;
  int32 limit = 2;
  string before = 3;
  string after = 4;
}

message GetMessagesResponse {
  repeated Message messages = 1;
  bool has_more = 2;
}

message EditMessageRequest {
  string message_id = 1;
  string content = 2;
}

message DeleteMessageRequest {
  string message_id = 1;
}

message DeleteMessageResponse {
  bool success = 1;
}

message StreamMessagesRequest {
  string channel_id = 1;
}
```

### Channel Service

```protobuf
// channel.proto
syntax = "proto3";

package QuckApp.channel;

service ChannelService {
  rpc CreateChannel(CreateChannelRequest) returns (Channel);
  rpc GetChannel(GetChannelRequest) returns (Channel);
  rpc ListChannels(ListChannelsRequest) returns (ListChannelsResponse);
  rpc UpdateChannel(UpdateChannelRequest) returns (Channel);
  rpc DeleteChannel(DeleteChannelRequest) returns (DeleteChannelResponse);
  rpc AddMembers(AddMembersRequest) returns (AddMembersResponse);
  rpc RemoveMember(RemoveMemberRequest) returns (RemoveMemberResponse);
}

message Channel {
  string id = 1;
  string workspace_id = 2;
  string name = 3;
  string description = 4;
  bool is_private = 5;
  string created_by = 6;
  int64 created_at = 7;
  int32 member_count = 8;
}

message CreateChannelRequest {
  string workspace_id = 1;
  string name = 2;
  string description = 3;
  bool is_private = 4;
  repeated string member_ids = 5;
}

message GetChannelRequest {
  string channel_id = 1;
}

message ListChannelsRequest {
  string workspace_id = 1;
  int32 limit = 2;
  string cursor = 3;
}

message ListChannelsResponse {
  repeated Channel channels = 1;
  string next_cursor = 2;
  bool has_more = 3;
}

message UpdateChannelRequest {
  string channel_id = 1;
  string name = 2;
  string description = 3;
}

message DeleteChannelRequest {
  string channel_id = 1;
}

message DeleteChannelResponse {
  bool success = 1;
}

message AddMembersRequest {
  string channel_id = 1;
  repeated string user_ids = 2;
}

message AddMembersResponse {
  int32 added_count = 1;
}

message RemoveMemberRequest {
  string channel_id = 1;
  string user_id = 2;
}

message RemoveMemberResponse {
  bool success = 1;
}
```

## Client Examples

### Node.js

```javascript
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const packageDefinition = protoLoader.loadSync('message.proto');
const proto = grpc.loadPackageDefinition(packageDefinition);

const client = new proto.QuckApp.message.MessageService(
  'grpc.QuckApp.dev:443',
  grpc.credentials.createSsl()
);

const metadata = new grpc.Metadata();
metadata.add('authorization', 'Bearer <jwt>');

client.getMessages({
  channel_id: 'channel-uuid',
  limit: 50
}, metadata, (err, response) => {
  if (err) console.error(err);
  else console.log(response.messages);
});
```

### Go

```go
package main

import (
    "context"
    "google.golang.org/grpc"
    "google.golang.org/grpc/credentials"
    "google.golang.org/grpc/metadata"
    pb "QuckApp/proto/message"
)

func main() {
    creds := credentials.NewTLS(&tls.Config{})
    conn, _ := grpc.Dial("grpc.QuckApp.dev:443", grpc.WithTransportCredentials(creds))
    defer conn.Close()

    client := pb.NewMessageServiceClient(conn)

    ctx := metadata.AppendToOutgoingContext(
        context.Background(),
        "authorization", "Bearer <jwt>",
    )

    resp, _ := client.GetMessages(ctx, &pb.GetMessagesRequest{
        ChannelId: "channel-uuid",
        Limit: 50,
    })

    for _, msg := range resp.Messages {
        fmt.Println(msg.Content)
    }
}
```

### Streaming

```javascript
// Server streaming example
const call = client.streamMessages({
  channel_id: 'channel-uuid'
}, metadata);

call.on('data', (message) => {
  console.log('New message:', message);
});

call.on('end', () => {
  console.log('Stream ended');
});

call.on('error', (err) => {
  console.error('Stream error:', err);
});
```

## Error Codes

| Code | Name | Description |
|------|------|-------------|
| 0 | OK | Success |
| 3 | INVALID_ARGUMENT | Invalid request parameters |
| 5 | NOT_FOUND | Resource not found |
| 7 | PERMISSION_DENIED | Insufficient permissions |
| 16 | UNAUTHENTICATED | Invalid or missing token |
| 14 | UNAVAILABLE | Service unavailable |
