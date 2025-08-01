import { validateRepoRef, truncateText, formatBytes, parseArgs } from '../index.js';
describe('Utils', () => {
    test('validateRepoRef validates repository references', () => {
        expect(validateRepoRef('Microsoft/TypeScript')).toBe(true);
        expect(validateRepoRef('user/repo-name')).toBe(true);
        expect(validateRepoRef('user/repo_name')).toBe(true);
        expect(validateRepoRef('user/repo.name')).toBe(true);
        expect(validateRepoRef('invalid')).toBe(false);
        expect(validateRepoRef('user/')).toBe(false);
        expect(validateRepoRef('/repo')).toBe(false);
        expect(validateRepoRef('user/repo/extra')).toBe(false);
    });
    test('truncateText truncates long text', () => {
        const shortText = 'Short text';
        const longText = 'This is a very long text that should be truncated at some point';
        expect(truncateText(shortText, 100)).toBe(shortText);
        expect(truncateText(longText, 20)).toHaveLength(23); // 20 + '...'
        expect(truncateText(longText, 20)).toMatch(/\.\.\.$/);
    });
    test('formatBytes formats byte sizes', () => {
        expect(formatBytes(0)).toBe('0.0 B');
        expect(formatBytes(1024)).toBe('1.0 KB');
        expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
        expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
        expect(formatBytes(1536)).toBe('1.5 KB');
    });
    test('parseArgs parses command line arguments', () => {
        const args = ['--flag', '--key', 'value', '--another-flag'];
        const parsed = parseArgs(args);
        expect(parsed.flag).toBe(true);
        expect(parsed.key).toBe('value');
        expect(parsed['another-flag']).toBe(true);
    });
});
//# sourceMappingURL=index.test.js.map