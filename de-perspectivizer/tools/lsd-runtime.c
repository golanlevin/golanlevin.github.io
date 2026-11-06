// Frame-local allocation for the unmodified LSD 1.6 C implementation.
// Nothing survives reserve_input(): JS must copy the result before the next call.
#include <stddef.h>
#include <stdint.h>
#include <stdarg.h>
#include "wasm-include/stdlib.h"
#include "wasm-include/stdio.h"
#include "../libraries/lsd/lsd.h"

__attribute__((import_module("host"), import_name("fail"))) void host_fail(const char *);
extern unsigned char __heap_base;
static uintptr_t cursor;
static double *input;
static double *output;
static int count;
FILE *stderr;

void *memcpy(void *dest, const void *src, size_t n) {
    unsigned char *d = dest; const unsigned char *s = src;
    for (size_t i = 0; i < n; ++i) d[i] = s[i];
    return dest;
}
void *memset(void *dest, int value, size_t n) {
    unsigned char *d = dest;
    for (size_t i = 0; i < n; ++i) d[i] = (unsigned char)value;
    return dest;
}
void *malloc(size_t size) {
    size_t aligned = (size + 7) & ~(size_t)7;
    uintptr_t start = cursor;
    uintptr_t end = start + 8 + aligned;
    size_t capacity = __builtin_wasm_memory_size(0) * 65536;
    if (end > capacity) {
        size_t pages = (end - capacity + 65535) / 65536;
        if (__builtin_wasm_memory_grow(0, pages) == (size_t)-1) {
            host_fail("LSD frame exceeded WASM memory limit"); __builtin_trap();
        }
    }
    *(size_t *)start = size;
    cursor = end;
    return (void *)(start + 8);
}
void *calloc(size_t count, size_t size) { return memset(malloc(count * size), 0, count * size); }
void *realloc(void *pointer, size_t size) {
    void *next = malloc(size);
    if (pointer) {
        size_t old = *(size_t *)((uintptr_t)pointer - 8);
        memcpy(next, pointer, old < size ? old : size);
    }
    return next;
}
void free(void *pointer) { (void)pointer; }
int abs(int value) { return value < 0 ? -value : value; }
_Noreturn void exit(int status) { (void)status; host_fail("LSD aborted"); __builtin_trap(); }
int fprintf(FILE *stream, const char *format, ...) {
    (void)stream; (void)format;
    va_list args; va_start(args, format);
    const char *message = va_arg(args, const char *);
    va_end(args);
    host_fail(message); // LSD's only fprintf is its fatal-error message.
    return 0;
}

double *reserve_input(int width, int height) {
    if (width < 8 || height < 8 || width > 800 || height > 800) {
        host_fail("Invalid LSD analysis dimensions"); return NULL;
    }
    cursor = ((uintptr_t)&__heap_base + 7) & ~(uintptr_t)7;
    count = 0; output = NULL;
    input = malloc((size_t)width * height * sizeof(double));
    return input;
}
int detect(int width, int height) {
    output = lsd(&count, input, width, height);
    return count;
}
double *result_pointer(void) { return output; }
size_t heap_used(void) { return cursor - (uintptr_t)&__heap_base; }
