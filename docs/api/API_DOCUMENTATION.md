# EduFlow API Documentation

## API Versioning Strategy

EduFlow uses URL-based API versioning to ensure backward compatibility while allowing for evolution of the API.

### Version Format
```
/api/v{version}/{resource}
```

### Current Versions
- **v1** - Current stable version (default)
- **v2** - Next version (in development)

---

## API v1 Endpoints

### Authentication
```
POST   /api/v1/auth/login          - User login
POST   /api/v1/auth/logout         - User logout
POST   /api/v1/auth/refresh        - Refresh JWT token
POST   /api/v1/auth/register       - Register new user
```

### Students
```
GET    /api/v1/students            - List all students
GET    /api/v1/students/:id        - Get student by ID
POST   /api/v1/students            - Create new student
PUT    /api/v1/students/:id        - Update student
DELETE /api/v1/students/:id        - Delete student
GET    /api/v1/students/:id/grades - Get student grades
GET    /api/v1/students/:id/attendance - Get student attendance
POST   /api/v1/students/:id/promote - Promote student to next grade
```

### Teachers
```
GET    /api/v1/teachers            - List all teachers
GET    /api/v1/teachers/:id        - Get teacher by ID
POST   /api/v1/teachers            - Create new teacher
PUT    /api/v1/teachers/:id        - Update teacher
DELETE /api/v1/teachers/:id        - Delete teacher
GET    /api/v1/teachers/:id/subjects - Get teacher's subjects
GET    /api/v1/teachers/:id/classes - Get teacher's classes
```

### Schools
```
GET    /api/v1/schools             - List all schools
GET    /api/v1/schools/:id         - Get school by ID
POST   /api/v1/schools             - Create new school
PUT    /api/v1/schools/:id         - Update school
DELETE /api/v1/schools/:id         - Delete school
GET    /api/v1/schools/:id/stats   - Get school statistics
```

### Grades
```
GET    /api/v1/grades              - List all grades
POST   /api/v1/grades              - Create new grade entry
PUT    /api/v1/grades/:id          - Update grade
DELETE /api/v1/grades/:id          - Delete grade
GET    /api/v1/grades/student/:student_id - Get grades by student
GET    /api/v1/grades/subject/:subject - Get grades by subject
```

### Attendance
```
GET    /api/v1/attendance          - List attendance records
POST   /api/v1/attendance          - Mark attendance
PUT    /api/v1/attendance/:id      - Update attendance
DELETE /api/v1/attendance/:id      - Delete attendance
GET    /api/v1/attendance/student/:student_id - Get student attendance
GET    /api/v1/attendance/date/:date - Get attendance by date
```

### Analytics
```
GET    /api/v1/analytics/student/:id - Student analytics
GET    /api/v1/analytics/teacher/:id - Teacher analytics
GET    /api/v1/analytics/school/:id  - School analytics
GET    /api/v1/analytics/dashboard   - Dashboard overview
```

---

## Optimized Endpoints (v1)

Performance-optimized endpoints with field selection and pagination:

```
GET /api/v1/optimized/students?fields=id,name,grade&page=1&per_page=20
GET /api/v1/optimized/teachers?fields=id,name,email,subject&page=1&per_page=20
GET /api/v1/optimized/schools?fields=id,name,code&page=1&per_page=20
```

### Query Parameters
- `fields` - Comma-separated list of fields to return
- `page` - Page number for pagination
- `per_page` - Number of items per page (max: 100)

---

## Response Format

### Success Response
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "أحمد محمد",
    "grade": "الخامس الابتدائي"
  },
  "message": "تم جلب البيانات بنجاح",
  "message_ar": "تم جلب البيانات بنجاح"
}
```

### Error Response
```json
{
  "success": false,
  "error": "Invalid input",
  "error_ar": "إدخال غير صالح",
  "details": {
    "field_name": "is required"
  }
}
```

### Paginated Response
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 150,
    "total_pages": 8
  }
}
```

---

## HTTP Status Codes

```
200 OK - Successful request
201 Created - Resource created successfully
204 No Content - Successful deletion
400 Bad Request - Invalid input
401 Unauthorized - Authentication required
403 Forbidden - Insufficient permissions
404 Not Found - Resource not found
409 Conflict - Resource conflict
422 Unprocessable Entity - Validation failed
429 Too Many Requests - Rate limit exceeded
500 Internal Server Error - Server error
```

---

## Rate Limiting

```
Default: 200 requests per 5 minutes
Auth endpoints: 5 requests per 5 minutes
API endpoints: 100 requests per minute
```

Rate limit headers:
```
X-RateLimit-Limit: 200
X-RateLimit-Remaining: 195
X-RateLimit-Reset: 1640000000
```

---

## Authentication

All protected endpoints require JWT authentication:

```
Authorization: Bearer <your_jwt_token>
```

### Token Types
- **Access Token**: Valid for 24 hours
- **Refresh Token**: Valid for 7 days

---

## API v2 (Planned Features)

### New in v2:
- GraphQL support
- Real-time updates via WebSocket
- Batch operations
- Advanced filtering and search
- Bulk import/export
- Enhanced analytics endpoints
- Machine learning predictions
- Automated reporting

### Migration Guide
When migrating from v1 to v2:
1. Review breaking changes in changelog
2. Update endpoint URLs from `/api/v1/` to `/api/v2/`
3. Test all integrations thoroughly
4. Plan migration timeline
5. Maintain v1 support during transition period

---

## Best Practices

1. **Always use HTTPS** in production
2. **Include Authorization header** for protected endpoints
3. **Handle rate limits** gracefully with exponential backoff
4. **Use field selection** to reduce payload size
5. **Implement pagination** for large datasets
6. **Cache responses** when appropriate
7. **Log all API calls** for debugging
8. **Monitor API performance** and errors

---

## Testing

Test environment available at:
```
https://api-test.eduflo.com/api/v1/
```

Use test tokens for development:
```bash
curl -X GET https://api-test.eduflo.com/api/v1/students \
  -H "Authorization: Bearer TEST_TOKEN"
```

---

## Support

For API support:
- Email: api-support@eduflo.com
- Documentation: https://docs.eduflo.com
- Status: https://status.eduflo.com
