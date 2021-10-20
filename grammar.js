const DIGITS = token(sep1(/[0-9]+/, /_+/))
const HEX_DIGITS = token(sep1(/[A-Fa-f0-9]+/, '_'))
// prettier-ignore
const PREC = {
  // https://introcs.cs.princeton.edu/java/11precedence/
  COMMENT: 0,      // //  /*  */
  ASSIGN: 1,       // =  += -=  *=  /=  %=  &=  ^=  |=  <<=  >>=  >>>=
  SWITCH_EXP: 1,   // always prefer to parse switch as expression over statement
  DECL: 2,
  ELEMENT_VAL: 2,
  TERNARY: 3,      // ?:
  OR: 4,           // ||
  AND: 5,          // &&
  BIT_OR: 6,       // |
  BIT_XOR: 7,      // ^
  BIT_AND: 8,      // &
  EQUALITY: 9,     // ==  !=
  GENERIC: 10,
  REL: 10,         // <  <=  >  >=  instanceof
  SHIFT: 11,       // <<  >>  >>>
  ADD: 12,         // +  -
  MULT: 13,        // *  /  %
  CAST: 14,        // (Type)
  OBJ_INST: 14,    // new
  UNARY: 15,       // ++a  --a  a++  a--  +  -  !  ~
  ARRAY: 16,       // [Index]
  OBJ_ACCESS: 16,  // .
  PARENS: 16,      // (Expression)
};

module.exports = grammar({
  name: 'java',

  extras: $ => [$.comment, /\s/],

  supertypes: $ => [
    $.expression,
    // $.statement,
    $.primary_expression,
    $._literal,
    // $.type,
    $._simple_type,
    // $.unannotated_type,
  ],

  inline: $ => [
    $._name,
    $._simple_type,
    $._reserved_identifier,
    $._class_body_declaration,
    $._variable_initializer,
  ],

  conflicts: $ => [
    // [$.modifiers, $.annotated_type, $.receiver_parameter],
    // [
    //   $.modifiers,
    //   $.annotated_type,
    //   $.module_declaration,
    //   $.package,
    // ],
    [$.inferred_parameters, $.primary_expression, $.unannotated_type],
    [($.unannotated_type, $.primary_expression, $.inferred_parameters)],
    [$.unannotated_type, $.primary_expression],
    [$.unannotated_type, $.primary_expression, $.scoped_type_identifier],
    [$.unannotated_type, $.scoped_type_identifier],
    [$.unannotated_type, $.generic_type],
    [$.generic_type, $.primary_expression],
    // Only conflicts in switch expressions
    [$.lambda, $.primary_expression],
    // [$.package, $.modifiers],
    [$.if],
    [$.if_clause, $.else_if_clause],

    [$.try],
    [$.inferred_parameters, $.formal_parameters],
    [$.lambda_parameter_list, $.primary_expression, $.unannotated_type],
    [$.lambda_parameters, $.primary_expression],
    [$.call_identifier, $._constructor_declarator],

    // TODO: Not sure if we need these two, need to fix for loop to handle semicolons properly.
    [$.for_clause, $.block_initializer],
    [$.condition, $.block_initializer],
  ],

  word: $ => $.identifier,

  rules: {
    program: $ =>
      seq(
        optional_with_placeholder('package_optional', $.package),
        optional_with_placeholder('import_list', repeat($.import)),
        optional_with_placeholder(
          'type_declaration_list',
          repeat($.type_declaration)
        ),
        optional_with_placeholder(
          'statement_list',
          repeat(
            choice(
              $.statement,
              $.record_declaration,
              $.method,
              $.static_initializer,
              $.constructor
            )
          )
        )
      ),

    // Literals

    _literal: $ =>
      choice(
        $.decimal_integer_literal,
        $.hex_integer_literal,
        $.octal_integer_literal,
        $.binary_integer_literal,
        $.decimal_floating_point_literal,
        $.hex_floating_point_literal,
        $.true,
        $.false,
        $.character_literal,
        $.string_literal,
        $.null_literal
      ),

    decimal_integer_literal: $ =>
      token(seq(DIGITS, optional(choice('l', 'L')))),

    hex_integer_literal: $ =>
      token(seq(choice('0x', '0X'), HEX_DIGITS, optional(choice('l', 'L')))),

    octal_integer_literal: $ =>
      token(
        seq(choice('0o', '0O'), sep1(/[0-7]+/, '_'), optional(choice('l', 'L')))
      ),

    binary_integer_literal: $ =>
      token(
        seq(choice('0b', '0B'), sep1(/[01]+/, '_'), optional(choice('l', 'L')))
      ),

    decimal_floating_point_literal: $ =>
      token(
        choice(
          seq(
            DIGITS,
            '.',
            optional(DIGITS),
            optional(seq(/[eE]/, optional(choice('-', '+')), DIGITS)),
            optional(/[fFdD]/)
          ),
          seq(
            '.',
            DIGITS,
            optional(seq(/[eE]/, optional(choice('-', '+')), DIGITS)),
            optional(/[fFdD]/)
          ),
          seq(
            DIGITS,
            /[eEpP]/,
            optional(choice('-', '+')),
            DIGITS,
            optional(/[fFdD]/)
          ),
          seq(
            DIGITS,
            optional(seq(/[eE]/, optional(choice('-', '+')), DIGITS)),
            /[fFdD]/
          )
        )
      ),

    hex_floating_point_literal: $ =>
      token(
        seq(
          choice('0x', '0X'),
          choice(
            seq(HEX_DIGITS, optional('.')),
            seq(optional(HEX_DIGITS), '.', HEX_DIGITS)
          ),
          optional(
            seq(
              /[eEpP]/,
              optional(choice('-', '+')),
              DIGITS,
              optional(/[fFdD]/)
            )
          )
        )
      ),

    true: $ => 'true',

    false: $ => 'false',

    character_literal: $ =>
      token(seq("'", repeat1(choice(/[^\\'\n]/, /\\./, /\\\n/)), "'")),

    string_literal: $ =>
      token(
        choice(
          seq('"', repeat(choice(/[^\\"\n]/, /\\(.|\n)/)), '"')
          // TODO: support multiline string literals by debugging the following:
          // seq('"', repeat(choice(/[^\\"\n]/, /\\(.|\n)/)), '"', '+', /\n/, '"', repeat(choice(/[^\\"\n]/, /\\(.|\n)/)))
        )
      ),

    null_literal: $ => 'null',

    // Expressions

    expression: $ =>
      choice(
        $.assignment_,
        $.binary_expression,
        $.instanceof_expression,
        $.lambda,
        $.ternary_expression,
        $.update_expression,
        $.primary_expression,
        $.unary_expression,
        $.cast_expression,
        prec(PREC.SWITCH_EXP, $.switch_expression)
      ),

    cast_expression: $ =>
      prec(
        PREC.CAST,
        seq(
          '(',
          sep1(field('type', $.type), '&'),
          ')',
          field('value', $.expression)
        )
      ),

    assignment_: $ =>
      prec.right(
        PREC.ASSIGN,
        seq(
          field(
            'assignment_variable',
            choice(
              $.identifier,
              $._reserved_identifier,
              $.field_access,
              $.array_access
            )
          ),
          field(
            'operator',
            choice(
              '=',
              '+=',
              '-=',
              '*=',
              '/=',
              '&=',
              '|=',
              '^=',
              '%=',
              '<<=',
              '>>=',
              '>>>='
            )
          ),
          field('assignment_value', $.expression)
        )
      ),

    binary_expression: $ =>
      choice(
        ...[
          ['>', PREC.REL],
          ['<', PREC.REL],
          ['>=', PREC.REL],
          ['<=', PREC.REL],
          ['==', PREC.EQUALITY],
          ['!=', PREC.EQUALITY],
          ['&&', PREC.AND],
          ['||', PREC.OR],
          ['+', PREC.ADD],
          ['-', PREC.ADD],
          ['*', PREC.MULT],
          ['/', PREC.MULT],
          ['&', PREC.BIT_AND],
          ['|', PREC.BIT_OR],
          ['^', PREC.BIT_XOR],
          ['%', PREC.MULT],
          ['<<', PREC.SHIFT],
          ['>>', PREC.SHIFT],
          ['>>>', PREC.SHIFT],
        ].map(([operator, precedence]) =>
          prec.left(
            precedence,
            seq(
              field('left', $.expression),
              field('operator', operator),
              field('right', $.expression)
            )
          )
        )
      ),

    instanceof_expression: $ =>
      prec(
        PREC.REL,
        seq(field('left', $.expression), 'instanceof', field('right', $.type))
      ),

    lambda: $ =>
      seq(
        field('parameter_list', $.lambda_parameters),
        '->',
        choice(field('return_value', $.expression), $.brace_enclosed_body)
      ),

    lambda_parameters: $ =>
      choice(
        field('parameter', $.identifier),
        $.formal_parameters,
        $.inferred_parameters
      ),

    inferred_parameters: $ =>
      seq(
        '(',
        optional_with_placeholder('parameter_list', $.lambda_parameter_list),
        ')'
      ),

    lambda_parameter_list: $ =>
      commaSep1(field('lambda_parameter', $.identifier)),

    ternary_expression: $ =>
      prec.right(
        PREC.TERNARY,
        seq(
          field('condition', $.expression),
          '?',
          field('consequence', $.expression),
          ':',
          field('alternative', $.expression)
        )
      ),

    unary_expression: $ =>
      choice(
        ...[
          ['+', PREC.UNARY],
          ['-', PREC.UNARY],
          ['!', PREC.UNARY],
          ['~', PREC.UNARY],
        ].map(([operator, precedence]) =>
          prec.left(
            precedence,
            seq(field('operator', operator), field('operand', $.expression))
          )
        )
      ),

    update_expression: $ =>
      prec.left(
        PREC.UNARY,
        choice(
          // Post (in|de)crement is evaluated before pre (in|de)crement
          seq($.expression, '++'),
          seq($.expression, '--'),
          seq('++', $.expression),
          seq('--', $.expression)
        )
      ),

    primary_expression: $ =>
      choice(
        $._literal,
        $.class_literal,
        $.this,
        $.identifier,
        $._reserved_identifier,
        $.parenthesized_expression,
        $.object_creation_expression,
        $.field_access,
        $.array_access,
        $.method_invocation,
        $.method_reference,
        $.array_creation_expression
      ),

    array_creation_expression: $ =>
      prec.right(
        seq(
          'new',
          $._simple_type,
          choice(
            seq(repeat1($.dimensions_expr), optional($.dimensions)),
            seq($.dimensions, field('value', $.array_initializer))
          )
        )
      ),

    dimensions_expr: $ => seq(repeat($.annotation_), '[', $.expression, ']'),

    parenthesized_expression: $ => seq('(', $.expression, ')'),

    class_literal: $ => seq($.unannotated_type, '.', 'class'),

    object_creation_expression: $ =>
      choice(
        $._unqualified_object_creation_expression,
        seq(
          $.primary_expression,
          '.',
          $._unqualified_object_creation_expression
        )
      ),

    _unqualified_object_creation_expression: $ =>
      prec.right(
        seq(
          'new',
          optional($.type_arguments),
          $._simple_type,
          $.arguments,
          optional_with_placeholder('brace_enclosed_body', $.class_body)
        )
      ),

    field_access: $ =>
      seq(
        field('object', choice($.primary_expression, $.super)),
        optional(seq('.', $.super)),
        '.',
        field('field', choice($.identifier, $._reserved_identifier, $.this))
      ),

    array_access: $ =>
      seq(
        field('array', $.primary_expression),
        '[',
        field('index', $.expression),
        ']'
      ),

    method_invocation: $ => $.call,

    call_identifier: $ =>
      choice(
        choice($.identifier, $._reserved_identifier),
        seq(
          choice($.primary_expression, $.super),
          '.',
          optional(seq($.super, '.')),
          optional($.type_arguments),
          choice($.identifier, $._reserved_identifier)
        )
      ),

    call: $ => seq(field('identifier', $.call_identifier), $.arguments),

    arguments: $ =>
      seq(
        '(',
        optional_with_placeholder('argument_list', commaSep($.argument)),
        ')'
      ),

    argument: $ => $.expression,

    method_reference: $ =>
      seq(
        choice(field('type_optional', $.type), $.primary_expression, $.super),
        '::',
        optional($.type_arguments),
        choice('new', $.identifier)
      ),

    type_arguments: $ => seq('<', commaSep(choice($.type, $.wildcard)), '>'),

    wildcard: $ =>
      seq(repeat($.annotation_), '?', optional($._wildcard_bounds)),

    _wildcard_bounds: $ => choice(seq('extends', $.type), seq($.super, $.type)),

    dimensions: $ => prec.right(repeat1(seq(repeat($.annotation_), '[', ']'))),

    switch_expression: $ =>
      seq('switch', '(', $.condition, ')', field('body', $.switch_block)),

    switch_block: $ =>
      seq(
        '{',
        choice(repeat($.switch_block_statement_group), repeat($.switch_rule)),
        '}'
      ),

    switch_block_statement_group: $ =>
      prec.left(seq(repeat1(seq($.switch_label, ':')), repeat($.statement))),

    switch_rule: $ =>
      seq(
        $.switch_label,
        '->',
        choice($.expression_statement, $.throw, $.brace_enclosed_body)
      ),

    switch_label: $ => choice(seq('case', commaSep1($.expression)), 'default'),

    // Statements

    statement: $ =>
      choice(
        $.module_declaration,
        $.annotation_type_declaration,
        $.expression_statement,
        $.labeled_statement,
        $.if,
        $.while,
        $.for,
        $.brace_enclosed_body,
        ';',
        $.assert_statement,
        $.do_statement,
        $.break_statement,
        $.continue_statement,
        $.return,
        $.yield_statement,
        $.switch_expression, //switch statements and expressions are identical
        $.synchronized_statement,
        field('variable_declaration', $.local_variable_declaration),
        $.throw,
        $.try,
        $.try_with_resources_statement
      ),

    brace_enclosed_body: $ =>
      seq(
        '{',
        optional_with_placeholder('statement_list', repeat($.statement)),
        '}'
      ),

    expression_statement: $ => seq($.expression, ';'),

    labeled_statement: $ => seq($.identifier, ':', $.statement),

    assert_statement: $ =>
      choice(
        seq('assert', $.expression, ';'),
        seq('assert', $.expression, ':', $.expression, ';')
      ),

    do_statement: $ =>
      seq(
        'do',
        field('body', $.statement),
        'while',
        '(',
        $.condition,
        ')',
        ';'
      ),

    break_statement: $ => seq('break', optional($.identifier), ';'),

    continue_statement: $ => seq('continue', optional($.identifier), ';'),

    // return_value: $ => $.expression,

    return: $ =>
      seq(
        'return',
        optional_with_placeholder(
          'return_value_optional',
          alias($.expression, $.return_value)
        ),
        ';'
      ),

    yield_statement: $ => seq('yield', $.expression, ';'),

    synchronized_statement: $ =>
      seq(
        'synchronized',
        $.parenthesized_expression,
        field('body', $.brace_enclosed_body)
      ),

    throw: $ => seq('throw', $.expression, ';'),

    // NOTE: This is simplified though technically we can't have try without either catch/finally.
    try: $ =>
      seq(
        $.try_clause,
        optional_with_placeholder('catch_list', repeat($.catch)),
        optional_with_placeholder('finally_clause_optional', $.finally_clause)
      ),

    try_clause: $ => seq('try', field('body', $.brace_enclosed_body)),

    catch: $ =>
      seq(
        'catch',
        '(',
        $.catch_parameter,
        ')',
        field('body', $.brace_enclosed_body)
      ),

    catch_parameter: $ =>
      seq(
        optional_with_placeholder('decorator_list', repeat($.annotation_)),
        optional_with_placeholder('modifier_list', repeat($.modifier)),
        $.catch_type,
        $._variable_declarator_id
      ),

    catch_type: $ => sep1($.unannotated_type, '|'),

    finally_clause: $ => seq('finally', $.brace_enclosed_body),

    try_with_resources_statement: $ =>
      seq(
        'try',
        field('resources', $.resource_specification),
        field('body', $.brace_enclosed_body),
        repeat($.catch),
        optional($.finally_clause)
      ),

    resource_specification: $ =>
      seq('(', sep1($.resource, ';'), optional(';'), ')'),

    resource: $ =>
      choice(
        seq(
          optional_with_placeholder('decorator_list', repeat($.annotation_)),
          optional_with_placeholder('modifier_list', repeat($.modifier)),
          field('type_optional', $.unannotated_type),
          $._variable_declarator_id,
          '=',
          field('value', $.expression)
        ),
        $.identifier,
        $.field_access
      ),

    condition: $ => $.expression,

    else_clause: $ => seq('else', field('consequence', $.statement)),

    else_if_clause: $ =>
      prec.dynamic(
        1,
        seq(
          'else',
          'if',
          '(',
          $.condition,
          ')',
          field('consequence', $.statement)
        )
      ),

    if_clause: $ =>
      prec.dynamic(
        0,
        seq('if', '(', $.condition, ')', field('consequence', $.statement))
      ),

    if: $ =>
      seq(
        $.if_clause,
        optional_with_placeholder(
          'else_if_clause_list',
          repeat($.else_if_clause)
        ),
        optional_with_placeholder('else_clause_optional', $.else_clause)
      ),

    while: $ =>
      field('while_clause', seq('while', '(', $.condition, ')', $.statement)),

    for: $ => choice($.for_clause, $.for_each_clause),

    for_clause: $ =>
      seq(
        'for',
        '(',
        optional_with_placeholder(
          'block_initializer_optional',
          $.block_initializer
        ),
        optional_with_placeholder('condition_optional', $.condition),
        ';',
        optional_with_placeholder('block_update_optional', $.block_update),
        ')',
        field('for_body', $.statement)
      ),

    block_initializer: $ =>
      choice(
        field('init', $.local_variable_declaration),
        seq(commaSep(field('init', $.expression)), ';')
      ),

    block_update: $ => commaSep1($.expression),

    for_each_clause: $ =>
      seq(
        'for',
        '(',
        $.block_iterator,
        ':',
        field('block_collection', $.expression),
        ')',
        field('for_body', $.statement)
      ),

    block_iterator: $ => $.formal_parameter,
    // seq(
    //   optional_with_placeholder('modifier_list', repeat($.modifier)),
    //   field('type_optional', $.unannotated_type),
    //   $._variable_declarator_id
    // ),

    // Annotations

    annotation_: $ =>
      field('decorator', choice($.marker_annotation, $.annotation)),

    marker_annotation: $ => seq('@', field('decorator_value', $._name)),

    annotation: $ =>
      seq('@', field('decorator_value', $.annotation_expression)),

    annotation_expression: $ =>
      seq(
        field('identifier', $._name),
        field('arguments', $.annotation_argument_list)
      ),

    annotation_argument_list: $ =>
      seq('(', choice($._element_value, commaSep($.element_value_pair)), ')'),

    element_value_pair: $ =>
      seq(field('key', $.identifier), '=', field('value', $._element_value)),

    _element_value: $ =>
      prec(
        PREC.ELEMENT_VAL,
        choice($.expression, $.element_value_array_initializer, $.annotation_)
      ),

    element_value_array_initializer: $ =>
      seq('{', commaSep($._element_value), optional(','), '}'),

    // Declarations

    type_declaration: $ =>
      prec(PREC.DECL, choice($.class, $.interface, $.enum)),

    module_declaration: $ =>
      seq(
        repeat($.annotation_),
        optional('open'),
        'module',
        field('identifier', $._name),
        field('body', $.module_body)
      ),

    module_body: $ => seq('{', repeat($.module_directive), '}'),

    module_directive: $ =>
      seq(
        choice(
          seq('requires', repeat($.requires_modifier), $._name),
          seq(
            'exports',
            $._name,
            optional('to'),
            optional($._name),
            repeat(seq(',', $._name))
          ),
          seq(
            'opens',
            $._name,
            optional('to'),
            optional($._name),
            repeat(seq(',', $._name))
          ),
          seq('uses', $._name),
          seq('provides', $._name, 'with', $._name, repeat(seq(',', $._name)))
        ),
        ';'
      ),

    requires_modifier: $ => choice('transitive', 'static'),

    package: $ => seq(repeat($.annotation_), 'package', $._name, ';'),

    import: $ =>
      seq(
        'import',
        optional('static'),
        $._name,
        optional(seq('.', $.asterisk)),
        ';'
      ),

    asterisk: $ => '*',

    enum: $ =>
      seq(
        optional_with_placeholder('decorator_list', repeat1($.annotation_)),
        optional_with_placeholder('modifier_list', repeat($.modifier)),
        'enum',
        field('name', $.identifier),
        optional_with_placeholder(
          'implements_list_optional',
          $.super_interfaces
        ),
        field('brace_enclosed_body', $.enum_body)
      ),

    enum_body: $ =>
      seq(
        '{',
        optional_with_placeholder(
          'enum_member_list',
          seq(
            commaSep($.enum_constant),
            optional(','),
            optional($.enum_body_declarations)
          )
        ),
        '}'
      ),

    enum_body_declarations: $ => seq(';', repeat($._class_body_declaration)),

    enum_constant: $ =>
      seq(
        optional_with_placeholder('decorator_list', repeat($.annotation_)),
        optional_with_placeholder('modifier_list', repeat($.modifier)),
        field('name', $.identifier),
        optional($.arguments),
        optional(field('brace_enclosed_body', $.class_body))
      ),

    class: $ =>
      seq(
        optional_with_placeholder('decorator_list', repeat1($.annotation_)),
        optional_with_placeholder('modifier_list', repeat($.modifier)),
        'class',
        field('name', $.identifier),
        optional($.type_parameter_list),
        optional_with_placeholder('extends_optional', $.superclass),
        optional_with_placeholder(
          'implements_list_optional',
          $.super_interfaces
        ),
        field('brace_enclosed_body', $.class_body)
      ),

    modifier: $ =>
      choice(
        'public',
        'protected',
        'private',
        'abstract',
        'static',
        'final',
        'strictfp',
        'default',
        'synchronized',
        'native',
        'transient',
        'volatile'
      ),

    // modifiers: $ =>
    // repeat1(

    // ),

    type_parameter_list: $ => seq('<', commaSep1($.type_parameter), '>'),

    type_parameter: $ =>
      seq(repeat($.annotation_), $.identifier, optional($.type_bound)),

    type_bound: $ => seq('extends', $.type, repeat(seq('&', $.type))),

    superclass: $ => seq('extends', $.extends_type),

    super_interfaces: $ => seq('implements', $.implements_list),

    implements_list: $ =>
      seq($.implements_type, repeat(seq(',', $.implements_type))),

    extends_type: $ => $.type,

    implements_type: $ => $.type,

    class_body: $ =>
      seq(
        '{',
        optional_with_placeholder(
          'class_member_list',
          repeat($._class_body_declaration)
        ),
        '}'
      ),

    _class_body_declaration: $ =>
      choice(
        $.property,
        $.record_declaration,
        $.method,
        $.class,
        $.interface,
        $.annotation_type_declaration,
        $.enum,
        $.brace_enclosed_body,
        $.static_initializer,
        $.constructor,
        ';'
      ),

    static_initializer: $ => seq('static', $.brace_enclosed_body),

    constructor: $ =>
      seq(
        optional_with_placeholder('decorator_list', repeat1($.annotation_)),
        optional_with_placeholder('modifier_list', repeat($.modifier)),
        $._constructor_declarator,
        optional_with_placeholder('throws_optional', $.throws),
        field('brace_enclosed_body', $.constructor_body)
      ),

    _constructor_declarator: $ =>
      seq(
        optional_with_placeholder('type_parameter_list', $.type_parameter_list),
        field('name', $.identifier),
        field('parameters', $.formal_parameters)
      ),

    constructor_body: $ =>
      seq(
        '{',

        optional_with_placeholder(
          'statement_list',
          seq(
            optional($.wrapped_explicit_constructor_invocation),
            repeat($.statement)
          )
        ),
        '}'
      ),

    wrapped_explicit_constructor_invocation: $ =>
      field('statement', $.explicit_constructor_invocation),

    explicit_constructor_invocation: $ =>
      seq(
        choice(
          seq(
            optional($.type_arguments),
            field('constructor_', choice($.this, $.super))
          ),
          seq(
            field('object', choice($.primary_expression)),
            '.',
            optional($.type_arguments),
            field('constructor_', $.super)
          )
        ),
        $.arguments,
        ';'
      ),

    _name: $ =>
      choice($.identifier, $._reserved_identifier, $.scoped_identifier),

    scoped_identifier: $ =>
      seq(field('scope', $._name), '.', field('name', $.identifier)),

    property: $ =>
      seq(
        optional_with_placeholder('decorator_list', repeat1($.annotation_)),
        optional_with_placeholder('modifier_list', repeat($.modifier)),
        field('type_optional', $.unannotated_type),
        $.assignment_list,
        ';'
      ),

    record_declaration: $ =>
      seq(
        optional_with_placeholder('decorator_list', repeat($.annotation_)),
        optional_with_placeholder('modifier_list', repeat($.modifier)),
        'record',
        field('name', $.identifier),
        field('parameters', $.formal_parameters),
        field('brace_enclosed_body', $.class_body)
      ),

    annotation_type_declaration: $ =>
      seq(
        optional_with_placeholder('decorator_list', repeat($.annotation_)),
        optional_with_placeholder('modifier_list', repeat($.modifier)),
        '@interface',
        field('name', $.identifier),
        field('body', $.annotation_type_body)
      ),

    annotation_type_body: $ =>
      seq(
        '{',
        repeat(
          choice(
            $.annotation_type_element_declaration,
            $.constant_declaration,
            $.class,
            $.interface,
            $.annotation_type_declaration
          )
        ),
        '}'
      ),

    annotation_type_element_declaration: $ =>
      seq(
        optional_with_placeholder('decorator_list', repeat($.annotation_)),
        optional_with_placeholder('modifier_list', repeat($.modifier)),
        field('type_optional', $.unannotated_type),
        field('name', $.identifier),
        '(',
        ')',
        optional($.dimensions),
        optional($._default_value),
        ';'
      ),

    _default_value: $ => seq('default', field('value', $._element_value)),

    interface: $ =>
      seq(
        optional_with_placeholder('decorator_list', repeat1($.annotation_)),
        optional_with_placeholder('modifier_list', repeat($.modifier)),
        'interface',
        field('name', $.identifier),
        optional_with_placeholder('type_parameter_list', $.type_parameter_list),
        optional_with_placeholder(
          'extends_list_optional',
          $.extends_interfaces
        ),
        field('brace_enclosed_body', $.interface_body)
      ),

    extends_interfaces: $ => seq('extends', $.extends_list),

    extends_list: $ =>
      seq('extends_type', $.extends_type, repeat(seq(',', $.extends_type))),

    interface_body: $ =>
      seq(
        '{',
        optional_with_placeholder(
          'interface_member_list',
          repeat(
            choice(
              $.constant_declaration,
              $.enum,
              $.method,
              $.class,
              $.interface,
              $.annotation_type_declaration,
              ';'
            )
          )
        ),
        '}'
      ),

    constant_declaration: $ =>
      seq(
        optional_with_placeholder('decorator_list', repeat($.annotation_)),
        optional_with_placeholder('modifier_list', repeat($.modifier)),
        field('type_optional', $.unannotated_type),
        $._variable_declarator_list,
        ';'
      ),

    _variable_declarator_list: $ =>
      commaSep1(field('assignment', $.variable_declarator)),

    assignment_list: $ => $._variable_declarator_list,

    variable_declarator: $ =>
      choice(
        seq(
          $._variable_declarator_id,
          optional_with_placeholder(
            'assignment_value_list_optional',
            '!!UNMATCHABLE_ba93e422'
          )
        ),
        $.declarator_assignment
      ),
    // field(
    //   'assignment',
    //   choice(, )

    // ),

    declarator_assignment: $ =>
      seq(
        field('assignment_variable', $.variable_declarator_id),
        seq('=', field('assignment_value', $._variable_initializer))
      ),

    _variable_declarator_id: $ =>
      seq(
        field(
          'assignment_variable',
          seq(
            choice($.identifier, $._reserved_identifier),
            optional($.dimensions)
          )
        )
      ),

    variable_declarator_id: $ => $._variable_declarator_id,

    _variable_initializer: $ => choice($.expression, $.array_initializer),

    array_initializer: $ =>
      seq('{', commaSep($._variable_initializer), optional(','), '}'),

    // Types

    type: $ => choice($.unannotated_type, $.annotated_type),

    unannotated_type: $ => field('type', choice($._simple_type, $.array_type)),

    _simple_type: $ =>
      field(
        'type',
        choice(
          $.void_type,
          $.integral_type,
          $.floating_point_type,
          $.boolean_type,
          alias($.identifier, $.type_identifier),
          $.scoped_type_identifier,
          $.generic_type
        )
      ),

    annotated_type: $ =>
      seq(
        field('type_decorator_list', repeat1($.annotation_)),
        $.unannotated_type
      ),

    scoped_type_identifier: $ =>
      seq(
        choice(
          alias($.identifier, $.type_identifier),
          $.scoped_type_identifier,
          $.generic_type
        ),
        '.',
        repeat($.annotation_),
        alias($.identifier, $.type_identifier)
      ),

    generic_type: $ =>
      prec.dynamic(
        PREC.GENERIC,
        seq(
          choice(
            alias($.identifier, $.type_identifier),
            $.scoped_type_identifier
          ),
          $.type_arguments
        )
      ),

    array_type: $ =>
      field(
        'type',
        seq(
          $.unannotated_type, // element
          $.dimensions // dimensions
        )
      ),

    integral_type: $ => choice('byte', 'short', 'int', 'long', 'char'),

    floating_point_type: $ => choice('float', 'double'),

    boolean_type: $ => 'boolean',

    void_type: $ => 'void',

    method_header: $ =>
      seq(
        optional(
          seq(
            field('type_parameter_list', $.type_parameter_list),
            optional_with_placeholder('decorator_list', repeat($.annotation_))
          )
        ),
        field('type_optional', $.unannotated_type),
        $.method_declarator,
        optional_with_placeholder('throws_optional', $.throws)
      ),

    method_declarator: $ =>
      seq(
        field('identifier', choice($.identifier, $._reserved_identifier)),
        field('parameters', $.formal_parameters),
        optional(field('dimensions', $.dimensions))
      ),

    formal_parameters: $ =>
      seq(
        '(',
        optional_with_placeholder(
          'parameter_list',
          // seq(
          //   optional($.receiver_parameter),
          //   commaSep($.parameter)
          // )),
          $.parameter_list
        ),
        ')'
      ),

    parameter_list: $ =>
      choice(
        seq($.receiver_parameter, commaSep($.parameter)),
        seq(optional($.receiver_parameter), commaSep1($.parameter))
      ),

    parameter: $ => choice($.formal_parameter, $.spread_parameter),

    formal_parameter: $ =>
      seq(
        optional_with_placeholder('decorator_list', repeat($.annotation_)),
        optional_with_placeholder('modifier_list', repeat($.modifier)),
        field('type_optional', $.unannotated_type),
        $._variable_declarator_id
      ),

    receiver_parameter: $ =>
      seq(
        repeat($.annotation_),
        $.unannotated_type,
        optional(seq($.identifier, '.')),
        $.this
      ),

    spread_parameter: $ =>
      seq(
        optional_with_placeholder('decorator_list', repeat($.annotation_)),
        optional_with_placeholder('modifier_list', repeat($.modifier)),
        field('type_optional', $.unannotated_type),
        '...',
        field('spread_parameter_variable', $.variable_declarator)
      ),

    throws: $ => seq('throws', commaSep1($.throws_type)),

    throws_type: $ => $.type,

    local_variable_declaration: $ =>
      seq(
        optional_with_placeholder('decorator_list', repeat($.annotation_)),
        optional_with_placeholder('modifier_list', repeat($.modifier)),
        field('type_optional', $.unannotated_type),
        $.assignment_list,
        ';'
      ),

    method: $ =>
      seq(
        optional_with_placeholder('decorator_list', repeat1($.annotation_)),
        optional_with_placeholder('modifier_list', repeat($.modifier)),
        $.method_header,
        choice(field('body', $.brace_enclosed_body), ';')
      ),

    reserved_identifiers: $ => choice('open', 'module'),
    _reserved_identifier: $ => alias($.reserved_identifiers, $.identifier),

    this: $ => 'this',

    super: $ => 'super',

    // https://docs.oracle.com/javase/specs/jls/se8/html/jls-3.html#jls-IdentifierChars
    identifier: $ => /[\p{L}_$][\p{L}\p{Nd}_$]*/,

    // http://stackoverflow.com/questions/13014947/regex-to-match-a-c-style-multiline-comment/36328890#36328890
    comment: $ =>
      token(
        prec(
          PREC.COMMENT,
          choice(seq('//', /.*/), seq('/*', /[^*]*\*+([^/*][^*]*\*+)*/, '/'))
        )
      ),
  },
})

function sep1(rule, separator) {
  return seq(rule, repeat(seq(separator, rule)))
}

function commaSep1(rule) {
  return seq(rule, repeat(seq(',', rule)))
}

function commaSep(rule) {
  return optional(commaSep1(rule))
}

function optional_with_placeholder(field_name, rule) {
  return choice(field(field_name, rule), field(field_name, blank()))
}
