# Chunking Optimization Improvements

## Problem
The original chunking logic was creating too many small chunks, especially for large translation files. For a file with 1000 lines, it was creating around 700 chunks, which caused:
- Rate limiting issues with online LLM providers
- Slow performance due to excessive API calls
- Inefficient resource usage

## Solution
Implemented a comprehensive chunking optimization strategy that:

### 1. Provider-Specific Dynamic Chunk Size Calculation

**Ollama (Local Models) - Conservative:**
- **Large files (>1000 keys)**: 8,000 chars, max 50 keys per chunk
- **Medium files (500-1000 keys)**: 6,000 chars, max 40 keys per chunk  
- **Small files (100-500 keys)**: 5,000 chars, max 30 keys per chunk
- **Very small files (<100 keys)**: 4,000 chars, max 20 keys per chunk

**OpenAI (Cloud) - Balanced:**
- **Large files (>1000 keys)**: 12,000 chars, max 80 keys per chunk
- **Medium files (500-1000 keys)**: 10,000 chars, max 60 keys per chunk  
- **Small files (100-500 keys)**: 8,000 chars, max 40 keys per chunk
- **Very small files (<100 keys)**: 6,000 chars, max 25 keys per chunk

**Claude (Cloud) - Moderate:**
- **Large files (>1000 keys)**: 15,000 chars, max 100 keys per chunk
- **Medium files (500-1000 keys)**: 12,000 chars, max 70 keys per chunk  
- **Small files (100-500 keys)**: 10,000 chars, max 50 keys per chunk
- **Very small files (<100 keys)**: 8,000 chars, max 30 keys per chunk

**Gemini (Rate-limited) - Very Conservative:**
- **Large files (>1000 keys)**: 10,000 chars, max 60 keys per chunk
- **Medium files (500-1000 keys)**: 8,000 chars, max 45 keys per chunk  
- **Small files (100-500 keys)**: 6,000 chars, max 35 keys per chunk
- **Very small files (<100 keys)**: 5,000 chars, max 20 keys per chunk

**OpenAI-Compatible (Cloud) - Balanced:**
- **Large files (>1000 keys)**: 12,000 chars, max 80 keys per chunk
- **Medium files (500-1000 keys)**: 10,000 chars, max 60 keys per chunk  
- **Small files (100-500 keys)**: 8,000 chars, max 40 keys per chunk
- **Very small files (<100 keys)**: 6,000 chars, max 25 keys per chunk

### 2. Provider-Specific Smart Content Distribution
- **Local providers (Ollama)**: Simple sorting to avoid complex processing overhead
- **Rate-limited providers (Gemini)**: Size-based sorting for better load distribution
- **Cloud providers (OpenAI, Claude)**: Balanced sorting for optimal performance
- Prevents chunks from becoming too large or too small
- Ensures optimal key-to-chunk ratio for each provider type

### 3. Provider-Specific Thresholds and Settings
- **Local providers**: 70% size threshold, max 25 keys per chunk
- **Rate-limited providers**: 60% size threshold, max 20 keys per chunk  
- **Cloud providers**: 80% size threshold, full max keys per chunk
- Increased default `chunkSize` from 3,000 to 15,000 characters
- Added intelligent chunking strategy based on file size and provider type

## Results
**Provider-Specific Optimization Results (709 keys test case):**

**Ollama (Local) - Conservative:**
- **29 chunks** with **24 keys** per chunk (~5300 chars)
- **Strategy**: Conservative for local processing limitations

**OpenAI (Cloud) - Balanced:**
- **14 chunks** with **51 keys** per chunk (~11000 chars)
- **Strategy**: Balanced for cloud processing efficiency

**Claude (Cloud) - Moderate:**
- **14 chunks** with **51 keys** per chunk (~11000 chars)
- **Strategy**: Moderate for cloud processing with larger context

**Gemini (Rate-limited) - Very Conservative:**
- **36 chunks** with **20 keys** per chunk (~4300 chars)
- **Strategy**: Very conservative to avoid rate limiting

**OpenAI-Compatible (Cloud) - Balanced:**
- **14 chunks** with **51 keys** per chunk (~11000 chars)
- **Strategy**: Balanced for cloud processing efficiency

## Benefits
- **Provider-specific optimization**: Different strategies for local vs cloud LLMs
- **Reduced timeout issues**: Especially for Ollama and other local models
- **Faster translation processing**: Optimized chunk sizes for each provider
- **Better resource utilization**: Prevents system overload
- **More efficient for large translation files**: Smart chunking based on content size

## Implementation Details
- `optimizeChunkingStrategy()`: Determines optimal chunking parameters based on content size
- `splitIntoChunks()`: Enhanced with smart content distribution and size-based limits
- Automatic logging of chunking statistics for monitoring
- Backward compatibility maintained with existing configuration options 