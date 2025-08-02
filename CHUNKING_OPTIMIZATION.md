# Chunking Optimization Improvements

## Problem
The original chunking logic was creating too many small chunks, especially for large translation files. For a file with 1000 lines, it was creating around 700 chunks, which caused:
- Rate limiting issues with online LLM providers
- Slow performance due to excessive API calls
- Inefficient resource usage

## Solution
Implemented a comprehensive chunking optimization strategy that:

### 1. Dynamic Chunk Size Calculation
**For Ollama (Local Models):**
- **Large files (>1000 keys)**: 8,000 chars, max 50 keys per chunk
- **Medium files (500-1000 keys)**: 6,000 chars, max 40 keys per chunk  
- **Small files (100-500 keys)**: 5,000 chars, max 30 keys per chunk
- **Very small files (<100 keys)**: 4,000 chars, max 20 keys per chunk

**For Other Providers (OpenAI, Claude, etc.):**
- **Large files (>1000 keys)**: 25,000 chars, max 200 keys per chunk
- **Medium files (500-1000 keys)**: 20,000 chars, max 150 keys per chunk  
- **Small files (100-500 keys)**: 15,000 chars, max 100 keys per chunk
- **Very small files (<100 keys)**: 10,000 chars, max 50 keys per chunk

### 2. Smart Content Distribution
- Sorts keys by value length (largest first) for better distribution
- Prevents chunks from becoming too large or too small
- Ensures optimal key-to-chunk ratio

### 3. Improved Default Settings
- Increased default `chunkSize` from 3,000 to 15,000 characters
- Added intelligent chunking strategy based on file size

## Results
**For Ollama (Local Models):**
- **Conservative chunking** for better local processing (709 keys: 8 → 29 chunks)
- **Smaller chunks** (25 keys, ~5300 chars per chunk) for faster processing
- **Reduced timeout issues** and better resource management

**For Other Providers (OpenAI, Claude, etc.):**
- **83% reduction** in chunks for large files (1000 keys: 40 → 7 chunks)
- **75% reduction** in chunks for medium files (500 keys: 20 → 5 chunks)
- **50% reduction** in chunks for small files (100 keys: 4 → 2 chunks)

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