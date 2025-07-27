# Evaluation API

This API provides automated evaluation of AI assistant responses using an LLM judge.

## Endpoints

### POST `/api/eval`

Starts a new evaluation job with a dataset of test cases.

**Request Body:**
```json
{
  "dataset": [
    {
      "id": "test_1",
      "input": "User request/question"
    }
  ]
}
```

**Response:**
```json
{
  "jobId": "eval_1703123456789_abc123def",
  "status": "running",
  "message": "Started evaluation of 3 test cases"
}
```

### GET `/api/eval/status/[jobId]`

Gets the current status and results of an evaluation job.

**Response:**
```json
{
  "jobId": "eval_1703123456789_abc123def",
  "status": "completed",
  "progress": 100,
  "results": [
    {
      "testCaseId": "test_1",
      "input": "User request",
      "aiResponse": "AI assistant response",
      "judgeScore": 8,
      "judgeReasoning": "Good response but could be more detailed"
    }
  ],
  "statistics": {
    "average": 7.5,
    "median": 8.0,
    "standardDeviation": 1.2,
    "count": 3
  },
  "isCompleted": true,
  "error": null,
  "createdAt": "2023-12-21T10:30:45.123Z",
  "completedAt": "2023-12-21T10:32:15.456Z"
}
```

## Usage Example

1. **Start evaluation:**
```bash
curl -X POST http://localhost:3000/api/eval \
  -H "Content-Type: application/json" \
  -d @example.json
```

2. **Check status:**
```bash
curl http://localhost:3000/api/eval/status/eval_1703123456789_abc123def
```

## Job Status

- `running`: Evaluation is in progress
- `completed`: Evaluation finished successfully
- `failed`: Evaluation failed with an error

## Scoring

The LLM judge scores responses on a scale of 1-10:
- 1-3: Poor (incorrect, unhelpful, or unclear)
- 4-6: Average (partially correct but missing key elements)
- 7-8: Good (mostly correct and helpful)
- 9-10: Excellent (completely correct, comprehensive, and clear)

## Test Case Context

Each test case can optionally include context similar to the UI:

- `currentFile`: The file that should be considered as "currently open"
- `selection`: A screen selection with `x`, `y`, `width`, and `height` coordinates

**Example with context:**
```json
{
  "dataset": [
    {
      "id": "basic_test",
      "input": "Create a button component"
    },
    {
      "id": "file_context_test",
      "input": "Add error handling to this function",
      "currentFile": "src/utils/api.ts"
    },
    {
      "id": "selection_test",
      "input": "Fix the styling issues in the selected area",
      "currentFile": "src/app/page.tsx",
      "selection": {
        "x": 100,
        "y": 200, 
        "width": 300,
        "height": 150
      }
    }
  ]
}
```

## Notes

- The evaluation uses the same chat API that users interact with for consistency
- Project files are automatically loaded and provided to the AI for each test case
- Results are stored in memory and will be lost on server restart
- For production use, consider implementing persistent storage 