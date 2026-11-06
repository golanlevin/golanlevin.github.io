#pragma once
typedef struct { int unused; } FILE;
extern FILE *stderr;
int fprintf(FILE *stream, const char *format, ...);
