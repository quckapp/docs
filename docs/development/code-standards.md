---
sidebar_position: 3
---

# Code Standards & Guidelines

## 1. General Principles

### 1.1 Core Values
- **Readability**: Code is read more than written
- **Simplicity**: Prefer simple solutions
- **Consistency**: Follow established patterns
- **Testability**: Design for testing

### 1.2 Code Review Checklist
- [ ] Follows style guide
- [ ] Has adequate tests
- [ ] No security vulnerabilities
- [ ] Error handling is complete
- [ ] Documentation is updated

## 2. Language-Specific Guidelines

### 2.1 Java (Spring Boot)

```java
// Package naming
com.quikapp.service.{service-name}.{layer}
// Example: com.quikapp.service.auth.controller

// Class naming
- Controllers: *Controller
- Services: *Service, *ServiceImpl
- Repositories: *Repository
- DTOs: *Request, *Response, *DTO
- Entities: No suffix

// Method naming
- Controllers: get*, create*, update*, delete*
- Services: find*, save*, update*, remove*
- Boolean methods: is*, has*, can*

// Example service
@Service
@RequiredArgsConstructor
public class UserServiceImpl implements UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    @Transactional(readOnly = true)
    public User findById(Long id) {
        return userRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("User", id));
    }

    @Override
    @Transactional
    public User create(CreateUserRequest request) {
        validateUniqueEmail(request.getEmail());

        User user = User.builder()
            .email(request.getEmail())
            .passwordHash(passwordEncoder.encode(request.getPassword()))
            .displayName(request.getDisplayName())
            .build();

        return userRepository.save(user);
    }
}
```

### 2.2 TypeScript (NestJS)

```typescript
// File naming
- kebab-case for files: user.service.ts
- PascalCase for classes: UserService
- camelCase for variables: userName

// Module structure
src/
  modules/
    user/
      user.module.ts
      user.controller.ts
      user.service.ts
      dto/
        create-user.dto.ts
      entities/
        user.entity.ts

// Example service
@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findById(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }

  async create(dto: CreateUserDto): Promise<User> {
    const user = this.userRepository.create(dto);
    const saved = await this.userRepository.save(user);

    this.eventEmitter.emit('user.created', { userId: saved.id });

    return saved;
  }
}
```

### 2.3 Go

```go
// Package naming
- Short, lowercase, single word
- Example: user, channel, message

// File naming
- snake_case: user_service.go
- Test files: user_service_test.go

// Interface naming
- Verb + "er": Reader, Writer, Handler
- Or descriptive: UserService

// Example service
package user

import (
    "context"
    "errors"
)

var ErrNotFound = errors.New("user not found")

type Service interface {
    FindByID(ctx context.Context, id string) (*User, error)
    Create(ctx context.Context, req CreateRequest) (*User, error)
}

type service struct {
    repo   Repository
    cache  Cache
    events EventPublisher
}

func NewService(repo Repository, cache Cache, events EventPublisher) Service {
    return &service{
        repo:   repo,
        cache:  cache,
        events: events,
    }
}

func (s *service) FindByID(ctx context.Context, id string) (*User, error) {
    // Check cache first
    if user, err := s.cache.Get(ctx, id); err == nil {
        return user, nil
    }

    user, err := s.repo.FindByID(ctx, id)
    if err != nil {
        return nil, fmt.Errorf("find user: %w", err)
    }

    // Cache for next time
    _ = s.cache.Set(ctx, id, user, 5*time.Minute)

    return user, nil
}
```

### 2.4 Python

```python
# File naming
- snake_case: user_service.py
- Test files: test_user_service.py

# Class naming
- PascalCase: UserService

# Function/variable naming
- snake_case: get_user_by_id

# Example service
from dataclasses import dataclass
from typing import Optional

from .models import User
from .repository import UserRepository
from .exceptions import UserNotFoundError


@dataclass
class CreateUserRequest:
    email: str
    display_name: str
    password: str


class UserService:
    def __init__(
        self,
        repository: UserRepository,
        password_hasher: PasswordHasher,
    ) -> None:
        self._repository = repository
        self._password_hasher = password_hasher

    async def find_by_id(self, user_id: str) -> User:
        """Find user by ID.

        Args:
            user_id: The user's unique identifier.

        Returns:
            The user if found.

        Raises:
            UserNotFoundError: If user doesn't exist.
        """
        user = await self._repository.find_by_id(user_id)
        if user is None:
            raise UserNotFoundError(user_id)
        return user

    async def create(self, request: CreateUserRequest) -> User:
        """Create a new user."""
        password_hash = self._password_hasher.hash(request.password)

        user = User(
            email=request.email,
            display_name=request.display_name,
            password_hash=password_hash,
        )

        return await self._repository.save(user)
```

### 2.5 Elixir

```elixir
# Module naming
- PascalCase: QuikApp.User.Service

# Function naming
- snake_case: find_by_id

# File naming
- snake_case: user_service.ex

# Example module
defmodule QuikApp.User.Service do
  @moduledoc """
  User management service.
  """

  alias QuikApp.User.{User, Repository}

  @doc """
  Finds a user by ID.

  ## Examples

      iex> find_by_id("user_123")
      {:ok, %User{}}

      iex> find_by_id("nonexistent")
      {:error, :not_found}
  """
  @spec find_by_id(String.t()) :: {:ok, User.t()} | {:error, :not_found}
  def find_by_id(id) do
    case Repository.get(id) do
      nil -> {:error, :not_found}
      user -> {:ok, user}
    end
  end

  @spec create(map()) :: {:ok, User.t()} | {:error, Ecto.Changeset.t()}
  def create(attrs) do
    %User{}
    |> User.changeset(attrs)
    |> Repository.insert()
  end
end
```

## 3. Testing Standards

### 3.1 Test Structure

```
test/
  unit/           # Unit tests (fast, isolated)
  integration/    # Integration tests (with dependencies)
  e2e/            # End-to-end tests (full stack)
  fixtures/       # Test data
  helpers/        # Test utilities
```

### 3.2 Test Naming

```
// Pattern: should_[expected]_when_[condition]

// Unit tests
should_return_user_when_id_exists
should_throw_not_found_when_id_invalid
should_create_user_when_valid_input

// Integration tests
should_persist_user_to_database
should_publish_event_on_create
```

### 3.3 Test Coverage Requirements

| Type | Minimum Coverage |
|------|-----------------|
| Unit Tests | 80% |
| Critical Paths | 100% |
| Integration | Key flows |

## 4. Documentation Standards

### 4.1 Code Comments

```java
/**
 * Creates a new user account.
 *
 * <p>This method validates the input, hashes the password,
 * persists the user, and publishes a user.created event.
 *
 * @param request the user creation request
 * @return the created user
 * @throws DuplicateEmailException if email already exists
 */
public User create(CreateUserRequest request) { ... }
```

### 4.2 API Documentation

- Use OpenAPI 3.0 for REST APIs
- Include request/response examples
- Document all error codes
- Keep schemas up to date

## 5. Git Conventions

### 5.1 Branch Naming

```
feature/QUIK-123-add-user-search
bugfix/QUIK-456-fix-message-ordering
hotfix/QUIK-789-security-patch
chore/update-dependencies
```

### 5.2 Commit Messages

```
type(scope): subject

[optional body]

[optional footer]

# Types
- feat: New feature
- fix: Bug fix
- docs: Documentation
- style: Formatting
- refactor: Code restructure
- test: Adding tests
- chore: Maintenance

# Examples
feat(auth): add SSO support for Okta

Implements OIDC authentication flow with Okta as the identity provider.
Includes automatic user provisioning on first login.

Closes #123
```

### 5.3 Pull Request Template

```markdown
## Description
[Brief description of changes]

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation

## Testing
- [ ] Unit tests added
- [ ] Integration tests added
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guide
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No security vulnerabilities
```

## 6. Security Guidelines

### 6.1 Input Validation
- Validate all user input
- Use parameterized queries
- Sanitize output

### 6.2 Authentication
- Use strong password hashing (bcrypt/argon2)
- Implement rate limiting
- Use secure session management

### 6.3 Secrets Management
- Never commit secrets
- Use environment variables
- Rotate secrets regularly

## Related Documentation

- [Technical Design](./technical-design) - Implementation details
- [API Documentation](../api/overview) - API specifications
- [Security](../architecture/security) - Security architecture
