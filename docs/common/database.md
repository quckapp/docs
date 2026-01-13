---
sidebar_position: 10
---

# Database Utilities

Database plugins, migrations, and repository patterns.

## Mongoose Plugins

### Soft Delete

```typescript
schema.plugin(softDeletePlugin);
// Adds: isDeleted, deletedAt fields
// Modifies: find queries to exclude soft-deleted
```

### Pagination

```typescript
schema.plugin(paginationPlugin);
// Adds: paginate() method
// Returns: { docs, total, page, limit, pages }
```

### Field Encryption

```typescript
schema.plugin(fieldEncryptionPlugin, {
  fields: ['phoneNumber', 'ssn'],
  secret: process.env.ENCRYPTION_KEY,
});
```

## Base Repository

```typescript
export abstract class BaseRepository<T> {
  abstract findById(id: string): Promise<T | null>;
  abstract findAll(options?: FindOptions): Promise<T[]>;
  abstract create(data: Partial<T>): Promise<T>;
  abstract update(id: string, data: Partial<T>): Promise<T>;
  abstract delete(id: string): Promise<void>;
  abstract paginate(query: any, options: PaginationOptions): Promise<PaginatedResult<T>>;
}
```
