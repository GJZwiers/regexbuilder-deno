import { applyMixins } from '../utils/mixin.ts';
import { stringOrRegExp } from "../utils/string_or_regexp.ts";

type groupCode = 'cg' | 'ncg' | 'la' | 'nla' | 'lb' | 'nlb';

const types = {
    cg: '(',
    ncg: '(?:',
    la: '(?=',
    lb: '(?<=',
    nla: '(?!',
    nlb: '(?<!',
    close: ')'
};

export function processGroupCode(type: groupCode): string {
    if (type === 'cg') {
        return types.cg;
    } else if (type === 'ncg') {
        return types.ncg;
    } else if (type === 'la') {
        return types.la;
    } else if (type === 'lb') {
        return types.lb;
    } else if (type === 'nla') {
        return types.nla;
    } else if (type === 'nlb') {
        return types.nlb;
    }
    return '';
}

class Regex {
    readonly parts: Array<string> = [];
    flags: string = '';
    /** Starts construction of a regular expression through a fluent builder API by providing chainable methods. */
    static new(): RegexBuilder {
        return new RegexBuilder();
    }
    /** Joins the list of regex components together and compiles the resulting string to a RegExp with any flags that were provided. */
    compile(): RegExp {
        let regexString = this.parts.join('');
        this.check(regexString);
        return new RegExp(regexString, this.flags);
    }

    private check(regex: string) {
        const nulWithDigit = regex.match(/\\0[0-9]/);
        if (nulWithDigit !== null) {
            console.warn(`(regexbuilder) Warning: found a digit character after a nul character class ${nulWithDigit}`);
        }
        const unicode = regex.match(/\\u\{[0-9A-Z]{4,5}\}/);
        if (unicode !== null && !/u/.test(this.flags)) {
            console.warn(`(regexbuilder) Warning: found a unicode character class ${unicode} while the unicode flag is not set`)
        }
    }
}

abstract class RegexBuilderBase {
    regex: Regex = new Regex();
    nests = 0;
    /** Finishes construction of a regular expression using the builder and returns the regex built. */
    build(): RegExp {
        if (this.nests > 0) {
            throw new Error("(regexbuilder) Error: Found unfinished nested structure in regex." + this.regex.parts);
        }
        return this.regex.compile();
    }
}

class FlagsBuilder extends RegexBuilderBase {
    /** Adds regex flags to the regex, for example 'g', 'i', 'gi' or 'm'. */
    flags(flags: string): this {
        this.regex.flags = flags;
        return this;
    }
}

class PatternPartBuilder extends RegexBuilderBase {
    /** Adds a part to the end of a regular expression. */
    add(part: string | RegExp): this {
        this.regex.parts.push(stringOrRegExp(part));
        return this;
    }
}

class PatternGroupBuilder extends RegexBuilderBase {
    /** Adds a capturing group with content to the end of a regular expression. */
    capture(cg: string | RegExp): this {
        this.regex.parts.push(types.cg, stringOrRegExp(cg), types.close);
        return this;
    }
    /** Adds a non-capturing group with content to the end of a regular expression. */
    noncapture(ncg: string | RegExp): this {
        this.regex.parts.push(types.ncg, stringOrRegExp(ncg), types.close);
        return this;
    }
    /** Adds a group with content to the end of a regular expression. */
    group(type: groupCode, content: string | RegExp) {
        let grouptype = processGroupCode(type);
        this.regex.parts.push(grouptype, stringOrRegExp(content), types.close);
        return this;
    }
    /** Adds a named capturing group with content to the end of a regular expression. */
    namedGroup(name: string, group: string | RegExp): this {
        this.regex.parts.push('(?<', name, '>', stringOrRegExp(group), types.close);
        return this;
    }
}

class PatternAssertionBuilder extends RegexBuilderBase {
    /** Adds a word boundary to the regex. */
    boundary() {
        this.regex.parts.push('\\b');
        return this;
    }
    /** Adds a word boundary to the regex. */
    negatedBoundary() {
        this.regex.parts.push('\\B');
        return this;
    }
    /** Adds the provided content to the regex within word boundaries `\bcontent\b` */
    bordered(content: string) {
        this.regex.parts.push(`\\b${content}\\b`);
        return this;
    }
    /** Adds a caret character, or start-of-the-line assertion, to the regex. */
    lineStart(): this {
        this.regex.parts.push('^');
        return this;
    }
    /** Adds a dollar character, or end-of-the-line assertion, to the regex. */
    lineEnd(): this {
        this.regex.parts.push('$');
        return this;
    }
    /** Combines RegexBuilder methods `lineStart()` and `add()`. */
    startsWith(start: string | RegExp): this {
        this.regex.parts.push('^', stringOrRegExp(start));
        return this;
    }
    /** Combines RegexBuilder methods add(...) and lineEnd(). */
    endsWith(end: string): this {
        this.regex.parts.push(end, '$');
        return this;
    }
    /** Adds a lookahead assertion to the regex. */
    lookahead(la: string | RegExp): this {
        this.regex.parts.push(types.la, stringOrRegExp(la), types.close);
        return this;
    }
    /** Adds a lookbehind assertion  to the regex. */
    lookbehind(lb: string | RegExp): this {
        this.regex.parts.push(types.lb, stringOrRegExp(lb), types.close);
        return this;
    }
    /** Adds a negated lookahead assertion  to the regex. */
    negatedLA(nla: string | RegExp): this {
        this.regex.parts.push(types.nla, stringOrRegExp(nla), types.close);
        return this;
    }
    /** Adds a negated lookbehind assertion to the regex. */
    negatedLB(nlb: string | RegExp): this {
        this.regex.parts.push(types.nlb, stringOrRegExp(nlb), types.close);
        return this;
    }
    /** Alias for `lookahead()`. */
    followedBy(la: string | RegExp): this {
        return this.lookahead(la);
    }
    /** Alias for `negatedLA()`. */
    notFollowedBy(nla: string | RegExp): this {
        return this.negatedLA(nla);
    }
    /** Alias for `lookbehind()`. */
    precededBy(lb: string | RegExp): this {
        return this.lookbehind(lb);
    }
    /** Alias for `negatedLB()`. */
    notPrecededBy(nlb: string | RegExp): this {
        return this.negatedLB(nlb);
    }
}

class PatternAlternationBuilder extends RegexBuilderBase {
    /** Joins a list of strings to the end of the regex as alternates. */
    alts(alts: (string|RegExp)[]): this {
        alts.forEach((item: string | RegExp, index: number, arr: (string|RegExp)[]) => {
            if (item instanceof RegExp) {
                arr[index] = item.source;
            }
        });
        this.regex.parts.push(alts.join('|'));
        return this;
    }
    /** Joins a list of strings to regex alternates wrapped in a certain regex group type and adds it  to the regex. */
    altGroup(alts: string[], code: groupCode): this {
        let grouptype = processGroupCode(code);
        this.regex.parts.push(grouptype, alts.join('|'), types.close)
        return this;
    }

    joinGroup(vals: string[], code: groupCode, separator: string): this {
        let grouptype = processGroupCode(code);
        this.regex.parts.push(grouptype, vals.join(separator), types.close);
        return this;
    }

    joinWith(vals: string[], separator: string): this {
        this.regex.parts.push(vals.join(separator));
        return this;
    }
}

class RegexClassBuilder extends RegexBuilderBase {
    /** Adds a character class to the regex with the string content provided.*/
    class(content: string | RegExp): this {
       this.regex.parts.push('[', stringOrRegExp(content), ']'); 
       return this;
    }
    /** Adds a negated character class to the regex with the string content provided. */
    negatedClass(content: string | RegExp): this {
        this.regex.parts.push('[^', stringOrRegExp(content), ']'); 
        return this;
    }
}

const charClasses = {
    digit: '\\d',
    nonDigit: '\\D',
    word: '\\w',
    nonWord: '\\W',
    whitespace: '\\s',
    nonWhitespace: '\\S',
    tab: '\\t',
    carrReturn: '\\r',
    linefeed: '\\n',
    formfeed: '\\f',
    backspace: '[\\b]',
    nul: '\\0'
}

class RegexCharacterClassBuilder extends RegexBuilderBase {
    private handleCharClass(charClass: string, n?: number, m?:  number | '*'): void {
        if (!n) this.regex.parts.push(charClass, `{1}`);
        else if (!m)
            this.regex.parts.push(charClass, `{${n.toString()}}`);
        else if (!Number.isInteger(n) )
            this.regex.parts.push(charClass, `{${Math.round(n).toString()}}`);
        else if (typeof m === 'number' && !Number.isInteger(m))
         this.regex.parts.push(charClass, `{${Math.round(m).toString()}}`);
        else if (m === '*')
            this.regex.parts.push(charClass, `{${n.toString()},}`);
        else
            this.regex.parts.push(charClass, `{${n.toString()},${m.toString()}}`);
    }
    /** Adds `\d` to the regex. */
    digit(): this {
        this.regex.parts.push(charClasses.digit);
        return this;
    }
    /** Adds `\d` with a quantifier. */
    digits(n?: number, m?: |  number | '*'): this {
        this.handleCharClass(charClasses.digit, n, m);
        return this;
    }
    /** Adds `\D` to the regex. */
    nonDigit() {
        this.regex.parts.push(charClasses.nonDigit);
        return this;
    }
    /** Adds `\D` with a quantifier. */
    nonDigits(n?: number, m?: |  number | '*') {
        this.handleCharClass(charClasses.nonDigit, n, m);
        return this;
    }

    word() {
        this.regex.parts.push(charClasses.word);
        return this;
    }
    /** Adds `\w` with a quantifier. */
    words(n?: number, m?: |  number | '*') {
        this.handleCharClass(charClasses.word, n, m);
        return this;
    }

    nonWord() {
        this.regex.parts.push(charClasses.nonWord);
        return this;
    }
    /** Adds `\W` with a quantifier. */
    nonWords(n?: number, m?: |  number | '*') {
        this.handleCharClass(charClasses.nonWord, n, m);
        return this;
    }

    any() {
        this.regex.parts.push('.');
		return this;
    }

    whitespace() {
        this.regex.parts.push(charClasses.whitespace);
		return this;
    }
    /** Adds `\s` with a quantifier. */
    whitespaces(n?: number, m?: |  number | '*') {
        this.handleCharClass(charClasses.whitespace, n, m);
		return this;
    }

    nonWhitespace() {
        this.regex.parts.push(charClasses.nonWhitespace);
		return this;
    }
    /** Adds `\S` with a quantifier. */
    nonWhitespaces(n?: number, m?: |  number | '*') {
        this.handleCharClass(charClasses.nonWhitespace, n, m);
		return this;
    }

    tab() {
        this.regex.parts.push(charClasses.tab);
		return this;
    }

    carrReturn() {
        this.regex.parts.push(charClasses.carrReturn);
		return this;
    }

    linefeed() {
        this.regex.parts.push(charClasses.linefeed);
		return this;
    }

    formfeed() {
        this.regex.parts.push(charClasses.formfeed);
		return this;
    }

    backspace() {
        this.regex.parts.push(charClasses.backspace);
		return this;
    }

    nul() {
        this.regex.parts.push(charClasses.nul);
		return this;
    }

    controlChar(x: string) {
        if (!/[A-Z]/.test(x)) 
            throw new Error(`(regexbuilder) Error: attempt to add invalid control character ${x}`);
        this.regex.parts.push(`\\c${x}`);
		return this;
    }

    hex(hh: string) {
        if (!/^[0-9A-F]{2}$/.test(hh)) 
            throw new Error("(regexbuilder) Error: attempt to add invalid hexadecimal characters");
        this.regex.parts.push(`\\x${hh}`);
		return this;
    }

    UTF16(hhhh: string) {
        if (!/^[0-9A-F]{4}$/.test(hhhh)) 
            throw new Error("(regexbuilder) Error: attempt to add invalid hexadecimal characters");
        this.regex.parts.push(`\\u${hhhh}`);
		return this;
    }

    unicode(hhhh: string) {
        if (!/^[0-9A-F]{4,5}$/.test(hhhh)) 
            throw new Error("(regexbuilder) Error: attempt to add invalid hexadecimal characters");
        this.regex.parts.push(`\\u\{${hhhh}\}`);
		return this;
    }   
}

class RegexQuantifierBuilder extends RegexBuilderBase {
    /** Adds an N quantifier {n}. */
    times(n: number): this {
        this.checkDouble();
        this.regex.parts.push(`{${n}}`);
        return this;
    } 
    /** Adds an N to M range quantifier {n,m}. */
    between(n: number, m: number): this {
        this.checkDouble();
        this.regex.parts.push(`{${n},${m}}`);
        return this;
    }
    /** Adds an N or more quantifier {n,}. */
    atleast(n: number): this {
        this.checkDouble();
        this.regex.parts.push(`{${n},}`);
        return this;
    }
    /** Adds a one or more quantifier `+`. */
    onePlus(): this {
        this.checkDouble();
        this.regex.parts.push('+');
        return this;
    }
    /** Adds a zero or more quantifier `*`. */
    zeroPlus(): this {
        this.checkDouble();
        this.regex.parts.push('*');
        return this;
    }
    /** Adds a zero or one quantifier `?`. */
    oneZero(): this {
        this.checkDouble();
        this.regex.parts.push('?');
        return this;
    }
    /**
     * Makes the previous quantifier lazy, meaning it will stop on the first match it finds in a string.
     * 
     * Example: In the string `'barbarbar'` the regex `(bar)+` will match `'barbarbar'` but` (bar)+? `will match `'bar'`
     */
    lazy(): this {
        this.checkModifier();
        this.regex.parts.push('?');
        return this;
    }

    private checkModifier() {
        const previousToken = this.getPreviousToken();
        if (!/\{\d ?, ?\d\}|\{\d\}|\*|\+/.test(this.regex.parts[this.regex.parts.length - 1])) {
            console.warn(`(regexbuilder) PlacementWarning: lazy modifier "?" was placed after "${previousToken}" which is not a quantifier. ` +
            'This will behave as a "one or zero" quantifier instead of a lazy modifier. ' +
            'If this is what you intend consider using the "oneZero()" method instead.');
        }
    }

    private checkDouble() {
        const previousToken = this.getPreviousToken();
        if (/\{\d\}|\{\d,\s?\d\}$/.test(previousToken)) {
            console.warn('(regexbuilder) PlacementWarning: A duplicate quantifier may have been added ' +
            'to the regex. Check that you are not chaining quantifier methods.');
        }
    }

    private getPreviousToken() {
        return this.regex.parts[this.regex.parts.length - 1]
    }
}

class RegexBackReferenceBuilder extends RegexBuilderBase {
    /**
     * Adds a backreference to a capturing group to the regex.
     * @param n - The number of the capturing group to be referenced, or 
     * the name of the named capturing group to be referenced as a string
     */
    ref(n: number | string): this {
        if (typeof n === 'number') {
            this.regex.parts.push(`\\${n}`);
        } else {
            this.regex.parts.push(`\\k<${n}>`)
        }

        return this;
    }
}

class NestedGroupBuilder extends RegexBuilderBase {
    /** Starts the addition of a nested tier to the regex. */
    nest(): this {
        this.changeNestState(1, types.cg);
        return this;
    }
    /** Finishes a nested tier in the regex. An integer can be passed to complete multiple tiers at once or an asterisk to finish all remaining nests. */
    unnest(n?: undefined | number | '*'): this {
        if (!n || n === 0) {
            this.changeNestState(-1, types.close);
            return this;
        }
        if (n === '*') {
            this.changeNestState(-this.nests, types.close);
            return this;
        }
        this.changeNestState(-n, types.close);
        return this;
    }
    /** Combines methods `nest()` and `add()`. */
    nestAdd(part: string | RegExp, type: groupCode = 'cg'): this {
        let grouptype = processGroupCode(type);
        this.changeNestState(1, grouptype);
        this.regex.parts.push(stringOrRegExp(part));
        return this;
    }
    /** Combines methods `nest()` and `noncapture()`. */
    nestNonCapture(): this {
        this.changeNestState(1, types.ncg);
        return this;
    }
    /** Combines methods `nest()` and `lookahead()`. */
    nestLookahead(): this {
        this.changeNestState(1, types.la);
        return this;
    }
    /** Combines methods `nest()` and `lookbehind()`. */
    nestLookbehind(): this {
        this.changeNestState(1, types.lb);
        return this;
    }
    /** Combines methods `nest()` and `negatedLA()`. */
    nestNegatedLA(): this {
        this.changeNestState(1, types.nla);
        return this;
    }
    /** Combines methods `nest()` and `negatedLB ()`. */
    nestNegatedLB(): this {
        this.changeNestState(1, types.nlb);
        return this;
    }
    /** Combines methods `nest()` and `namedGroup()`. */
    nestNamed(name: string, content: string | RegExp): this {
        this.changeNestState(1, `(?<${name}>${stringOrRegExp(content)}`);
        return this;
    }

    private changeNestState(num: number, char: string) {
        for (let i = 0; i < Math.abs(num); i++) {
            this.regex.parts.push(char);
        }
        this.nests += num;
    }
}

class RegexBuilder {
    nests = 0;
    regex: Regex = new Regex();
}

interface RegexBuilder extends FlagsBuilder,
    PatternPartBuilder,
    PatternGroupBuilder,
    PatternAssertionBuilder,
    PatternAlternationBuilder,
    RegexClassBuilder,
    RegexQuantifierBuilder,
    RegexBackReferenceBuilder,
    RegexCharacterClassBuilder,
    NestedGroupBuilder {}

applyMixins(RegexBuilder, [
    RegexBuilderBase, 
    FlagsBuilder, 
    PatternPartBuilder,
    PatternGroupBuilder,
    PatternAssertionBuilder,
    PatternAlternationBuilder,
    RegexClassBuilder,
    RegexQuantifierBuilder,
    RegexBackReferenceBuilder,
    RegexCharacterClassBuilder,
    NestedGroupBuilder ]);

export { Regex, RegexBuilder }
