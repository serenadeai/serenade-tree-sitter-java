const DIGITS = token(sep1(/[0-9]+/, /_+/));
const HEX_DIGITS = token(sep1(/[A-Fa-f0-9]+/, "_"));
const PREC = {
  // https://introcs.cs.princeton.edu/java/11precedence/
  COMMENT: 0, // //  /*  */
  ASSIGN: 1, // =  += -=  *=  /=  %=  &=  ^=  |=  <<=  >>=  >>>=
  SWITCH_EXP: 1, // always prefer to parse switch as expression over statement
  DECL: 2,
  ELEMENT_VAL: 2,
  TERNARY: 3, // ?:
  OR: 4, // ||
  AND: 5, // &&
  BIT_OR: 6, // |
  BIT_XOR: 7, // ^
  BIT_AND: 8, // &
  EQUALITY: 9, // ==  !=
  GENERIC: 10,
  REL: 10, // <  <=  >  >=  instanceof
  SHIFT: 11, // <<  >>  >>>
  ADD: 12, // +  -
  MULT: 13, // *  /  %
  CAST: 14, // (Type)
  OBJ_INST: 14, // new
  UNARY: 15, // ++a  --a  a++  a--  +  -  !  ~
  ARRAY: 16, // [Index]
  OBJ_ACCESS: 16, // .
  PARENS: 16, // (Expression)
};

module.exports = grammar({
  name: "java",

  extras: ($) => [$.comment, /\s/],

  supertypes: ($) => [
    $.expression,
    $.statement,
    $.primary_expression,
    $._literal,
    $._type,
    $._simple_type,
    $._unannotated_type,
  ],

  inline: ($) => [
    $._name,
    $._simple_type,
    $._reserved_identifier,
    $._class_body_declaration,
    $._variable_initializer,
  ],

  conflicts: ($) => [
    [$.modifiers, $.annotated_type, $.receiver_parameter],
    [$.modifiers, $.annotated_type, $.module_declaration, $.package_declaration],
    [$.inferred_parameters, $.primary_expression, $._unannotated_type],
    [($._unannotated_type, $.primary_expression, $.inferred_parameters)],
    [$._unannotated_type, $.primary_expression],
    [$._unannotated_type, $.primary_expression, $.scoped_type_identifier],
    [$._unannotated_type, $.scoped_type_identifier],
    [$._unannotated_type, $.generic_type],
    [$.generic_type, $.primary_expression],
    // Only conflicts in switch expressions
    [$.lambda_expression, $.primary_expression],
    [$.package_declaration, $.modifiers],
    [$.if_statement],
    [$.try_statement],
    [$.inferred_parameters, $.formal_parameters],
    [$.lambda_parameter_list, $.primary_expression, $._unannotated_type],
    [$.lambda_parameters, $.primary_expression],
  ],

  word: ($) => $.identifier,

  rules: {
    program: ($) =>
      seq(
        optional_with_placeholder("package_declaration_placeholder", $.package_declaration),
        optional_with_placeholder("import_list", repeat($.import_declaration)),
        optional_with_placeholder("type_declaration_list", repeat($.type_declaration)),
        optional_with_placeholder(
          "statement_list",
          repeat(
            choice(
              $.statement,
              $.record_declaration,
              $.method_declaration,
              $.static_initializer,
              $.constructor_declaration
            )
          )
        )
      ),

    // Literals

    _literal: ($) =>
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

    decimal_integer_literal: ($) => token(seq(DIGITS, optional(choice("l", "L")))),

    hex_integer_literal: ($) =>
      token(seq(choice("0x", "0X"), HEX_DIGITS, optional(choice("l", "L")))),

    octal_integer_literal: ($) =>
      token(seq(choice("0o", "0O"), sep1(/[0-7]+/, "_"), optional(choice("l", "L")))),

    binary_integer_literal: ($) =>
      token(seq(choice("0b", "0B"), sep1(/[01]+/, "_"), optional(choice("l", "L")))),

    decimal_floating_point_literal: ($) =>
      token(
        choice(
          seq(
            DIGITS,
            ".",
            optional(DIGITS),
            optional(seq(/[eE]/, optional(choice("-", "+")), DIGITS)),
            optional(/[fFdD]/)
          ),
          seq(
            ".",
            DIGITS,
            optional(seq(/[eE]/, optional(choice("-", "+")), DIGITS)),
            optional(/[fFdD]/)
          ),
          seq(DIGITS, /[eEpP]/, optional(choice("-", "+")), DIGITS, optional(/[fFdD]/)),
          seq(DIGITS, optional(seq(/[eE]/, optional(choice("-", "+")), DIGITS)), /[fFdD]/)
        )
      ),

    hex_floating_point_literal: ($) =>
      token(
        seq(
          choice("0x", "0X"),
          choice(seq(HEX_DIGITS, optional(".")), seq(optional(HEX_DIGITS), ".", HEX_DIGITS)),
          optional(seq(/[eEpP]/, optional(choice("-", "+")), DIGITS, optional(/[fFdD]/)))
        )
      ),

    true: ($) => "true",

    false: ($) => "false",

    character_literal: ($) => token(seq("'", repeat1(choice(/[^\\'\n]/, /\\./, /\\\n/)), "'")),

    string_literal: ($) =>
      token(
        choice(
          seq('"', repeat(choice(/[^\\"\n]/, /\\(.|\n)/)), '"')
          // TODO: support multiline string literals by debugging the following:
          // seq('"', repeat(choice(/[^\\"\n]/, /\\(.|\n)/)), '"', '+', /\n/, '"', repeat(choice(/[^\\"\n]/, /\\(.|\n)/)))
        )
      ),

    null_literal: ($) => "null",

    // Expressions

    expression: ($) =>
      choice(
        $.assignment_expression,
        $.binary_expression,
        $.instanceof_expression,
        $.lambda_expression,
        $.ternary_expression,
        $.update_expression,
        $.primary_expression,
        $.unary_expression,
        $.cast_expression,
        prec(PREC.SWITCH_EXP, $.switch_expression)
      ),

    cast_expression: ($) =>
      prec(
        PREC.CAST,
        seq("(", sep1(field("type", $._type), "&"), ")", field("value", $.expression))
      ),

    assignment_expression: ($) =>
      prec.right(
        PREC.ASSIGN,
        seq(
          field(
            "assignment_variable",
            choice($.identifier, $._reserved_identifier, $.field_access, $.array_access)
          ),
          field(
            "operator",
            choice("=", "+=", "-=", "*=", "/=", "&=", "|=", "^=", "%=", "<<=", ">>=", ">>>=")
          ),
          field("assignment_value", $.expression)
        )
      ),

    binary_expression: ($) =>
      choice(
        ...[
          [">", PREC.REL],
          ["<", PREC.REL],
          [">=", PREC.REL],
          ["<=", PREC.REL],
          ["==", PREC.EQUALITY],
          ["!=", PREC.EQUALITY],
          ["&&", PREC.AND],
          ["||", PREC.OR],
          ["+", PREC.ADD],
          ["-", PREC.ADD],
          ["*", PREC.MULT],
          ["/", PREC.MULT],
          ["&", PREC.BIT_AND],
          ["|", PREC.BIT_OR],
          ["^", PREC.BIT_XOR],
          ["%", PREC.MULT],
          ["<<", PREC.SHIFT],
          [">>", PREC.SHIFT],
          [">>>", PREC.SHIFT],
        ].map(([operator, precedence]) =>
          prec.left(
            precedence,
            seq(
              field("left", $.expression),
              field("operator", operator),
              field("right", $.expression)
            )
          )
        )
      ),

    instanceof_expression: ($) =>
      prec(PREC.REL, seq(field("left", $.expression), "instanceof", field("right", $._type))),

    lambda_expression: ($) =>
      seq(
        $.lambda_parameters,
        "->",
        field("body", choice(field("lambda_return", $.expression), $.block))
      ),

    lambda_parameters: ($) =>
      choice(field("lambda_parameter", $.identifier), $.formal_parameters, $.inferred_parameters),

    inferred_parameters: ($) =>
      seq("(", optional_with_placeholder("parameter_list", $.lambda_parameter_list), ")"),

    lambda_parameter_list: ($) => commaSep1(field("lambda_parameter", $.identifier)),

    ternary_expression: ($) =>
      prec.right(
        PREC.TERNARY,
        seq(
          field("condition", $.expression),
          "?",
          field("consequence", $.expression),
          ":",
          field("alternative", $.expression)
        )
      ),

    unary_expression: ($) =>
      choice(
        ...[
          ["+", PREC.UNARY],
          ["-", PREC.UNARY],
          ["!", PREC.UNARY],
          ["~", PREC.UNARY],
        ].map(([operator, precedence]) =>
          prec.left(precedence, seq(field("operator", operator), field("operand", $.expression)))
        )
      ),

    update_expression: ($) =>
      prec.left(
        PREC.UNARY,
        choice(
          // Post (in|de)crement is evaluated before pre (in|de)crement
          seq($.expression, "++"),
          seq($.expression, "--"),
          seq("++", $.expression),
          seq("--", $.expression)
        )
      ),

    primary_expression: ($) =>
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

    array_creation_expression: ($) =>
      prec.right(
        seq(
          "new",
          $._simple_type,
          choice(
            seq(
              field("dimensions", repeat1($.dimensions_expr)),
              field("dimensions", optional($.dimensions))
            ),
            seq(field("dimensions", $.dimensions), field("value", $.array_initializer))
          )
        )
      ),

    dimensions_expr: ($) => seq(repeat($._annotation), "[", $.expression, "]"),

    parenthesized_expression: ($) => seq("(", $.expression, ")"),

    class_literal: ($) => seq($._unannotated_type, ".", "class"),

    object_creation_expression: ($) =>
      choice(
        $._unqualified_object_creation_expression,
        seq($.primary_expression, ".", $._unqualified_object_creation_expression)
      ),

    _unqualified_object_creation_expression: ($) =>
      prec.right(
        seq(
          "new",
          field("type_arguments", optional($.type_arguments)),
          $._simple_type,
          $.arguments,
          optional($.class_body)
        )
      ),

    field_access: ($) =>
      seq(
        field("object", choice($.primary_expression, $.super)),
        optional(seq(".", $.super)),
        ".",
        field("field", choice($.identifier, $._reserved_identifier, $.this))
      ),

    array_access: ($) =>
      seq(field("array", $.primary_expression), "[", field("index", $.expression), "]"),

    method_invocation: ($) =>
      seq(
        choice(
          field("name", choice($.identifier, $._reserved_identifier)),
          seq(
            field("object", choice($.primary_expression, $.super)),
            ".",
            optional(seq($.super, ".")),
            field("type_arguments", optional($.type_arguments)),
            field("name", choice($.identifier, $._reserved_identifier))
          )
        ),
        $.arguments
      ),

    arguments: ($) =>
      seq("(", optional_with_placeholder("argument_list", commaSep($.argument)), ")"),

    argument: ($) => $.expression,

    method_reference: ($) =>
      seq(
        choice($._type, $.primary_expression, $.super),
        "::",
        optional($.type_arguments),
        choice("new", $.identifier)
      ),

    type_arguments: ($) => seq("<", commaSep(choice($._type, $.wildcard)), ">"),

    wildcard: ($) => seq(repeat($._annotation), "?", optional($._wildcard_bounds)),

    _wildcard_bounds: ($) => choice(seq("extends", $._type), seq($.super, $._type)),

    dimensions: ($) => prec.right(repeat1(seq(repeat($._annotation), "[", "]"))),

    switch_expression: ($) =>
      seq("switch", field("condition", $.parenthesized_expression), field("body", $.switch_block)),

    switch_block: ($) =>
      seq("{", choice(repeat($.switch_block_statement_group), repeat($.switch_rule)), "}"),

    switch_block_statement_group: ($) =>
      prec.left(seq(repeat1(seq($.switch_label, ":")), repeat($.statement))),

    switch_rule: ($) =>
      seq($.switch_label, "->", choice($.expression_statement, $.throw_statement, $.block)),

    switch_label: ($) => choice(seq("case", commaSep1($.expression)), "default"),

    // Statements

    statement: ($) =>
      choice(
        $.module_declaration,
        $.annotation_type_declaration,
        $.expression_statement,
        $.labeled_statement,
        $.if_statement,
        $.while_statement,
        $.for_statement,
        $.enhanced_for_statement,
        $.block,
        ";",
        $.assert_statement,
        $.do_statement,
        $.break_statement,
        $.continue_statement,
        $.return_statement,
        $.yield_statement,
        $.switch_expression, //switch statements and expressions are identical
        $.synchronized_statement,
        $.local_variable_declaration,
        $.throw_statement,
        $.try_statement,
        $.try_with_resources_statement
      ),

    block: ($) => seq("{", repeat($.statement), "}"),

    expression_statement: ($) => seq($.expression, ";"),

    labeled_statement: ($) => seq($.identifier, ":", $.statement),

    assert_statement: ($) =>
      choice(seq("assert", $.expression, ";"), seq("assert", $.expression, ":", $.expression, ";")),

    do_statement: ($) =>
      seq(
        "do",
        field("body", $.statement),
        "while",
        field("condition", $.parenthesized_expression),
        ";"
      ),

    break_statement: ($) => seq("break", optional($.identifier), ";"),

    continue_statement: ($) => seq("continue", optional($.identifier), ";"),

    return_statement: ($) =>
      seq(
        "return",
        optional_with_placeholder(
          "return_value_optional",
          optional(field("return_value", $.expression))
        ),
        ";"
      ),

    yield_statement: ($) => seq("yield", $.expression, ";"),

    synchronized_statement: ($) =>
      seq("synchronized", $.parenthesized_expression, field("body", $.block)),

    throw_statement: ($) => seq("throw", $.expression, ";"),

    try_statement: ($) =>
      seq(
        $.try_clause,
        choice(
          seq(
            field("catch_list", repeat1($.catch_clause)),
            optional_with_placeholder("finally_placeholder", $.finally_clause)
          ),
          seq(
            optional_with_placeholder("catch_list_placeholder", repeat($.catch_clause)),
            $.finally_clause
          )
        )
      ),

    try_clause: ($) => seq("try", field("body", $.block)),

    catch_clause: ($) => seq("catch", "(", $.catch_formal_parameter, ")", field("body", $.block)),

    catch_formal_parameter: ($) =>
      seq(optional($.modifiers), $.catch_type, $._variable_declarator_id),

    catch_type: ($) => sep1($._unannotated_type, "|"),

    finally_clause: ($) => seq("finally", $.block),

    try_with_resources_statement: ($) =>
      seq(
        "try",
        field("resources", $.resource_specification),
        field("body", $.block),
        repeat($.catch_clause),
        optional($.finally_clause)
      ),

    resource_specification: ($) => seq("(", sep1($.resource, ";"), optional(";"), ")"),

    resource: ($) =>
      choice(
        seq(
          optional($.modifiers),
          field("type", $._unannotated_type),
          $._variable_declarator_id,
          "=",
          field("value", $.expression)
        ),
        $.identifier,
        $.field_access
      ),

    else_clause: ($) => seq("else", field("consequence", $.statement)),

    else_if_clause: ($) =>
      prec(
        1,
        seq(
          "else",
          "if",
          field("condition", $.parenthesized_expression),
          field("consequence", $.statement)
        )
      ),

    if_clause: ($) =>
      prec(
        -1,
        seq("if", field("condition", $.parenthesized_expression), field("consequence", $.statement))
      ),

    if_statement: ($) =>
      seq(
        $.if_clause,
        optional_with_placeholder("else_if_list", repeat($.else_if_clause)),
        optional_with_placeholder("else_clause_placeholder", $.else_clause)
      ),

    while_statement: ($) =>
      seq(
        "while",
        field("condition", $.parenthesized_expression),
        field("while_body", $.statement)
      ),

    for_statement: ($) =>
      seq(
        "for",
        "(",
        optional_with_placeholder(
          "init_placeholder",
          choice(
            field("init", $.local_variable_declaration),
            seq(commaSep(field("init", $.expression)), ";")
          )
        ),
        optional_with_placeholder("for_condition_placeholder", $.expression),
        ";",
        optional_with_placeholder("update_placeholder", commaSep(field("update", $.expression))),
        ")",
        field("for_body", $.statement)
      ),

    enhanced_for_statement: ($) =>
      seq(
        "for",
        "(",
        $.enhanced_for_left,
        ":",
        field("enhanced_for_right", $.expression),
        ")",
        field("for_body", $.statement)
      ),

    enhanced_for_left: ($) =>
      seq(optional($.modifiers), field("type", $._unannotated_type), $._variable_declarator_id),

    // Annotations

    _annotation: ($) => choice($.marker_annotation, $.annotation),

    marker_annotation: ($) => seq("@", field("name", $._name)),

    annotation: ($) => seq("@", $.annotation_expression),

    annotation_expression: ($) =>
      seq(field("name", $._name), field("arguments", $.annotation_argument_list)),

    annotation_argument_list: ($) =>
      seq("(", choice($._element_value, commaSep($.element_value_pair)), ")"),

    element_value_pair: ($) =>
      seq(field("key", $.identifier), "=", field("value", $._element_value)),

    _element_value: ($) =>
      prec(
        PREC.ELEMENT_VAL,
        choice($.expression, $.element_value_array_initializer, $._annotation)
      ),

    element_value_array_initializer: ($) =>
      seq("{", commaSep($._element_value), optional(","), "}"),

    // Declarations

    type_declaration: ($) =>
      prec(PREC.DECL, choice($.class_declaration, $.interface_declaration, $.enum_declaration)),

    module_declaration: ($) =>
      seq(
        repeat($._annotation),
        optional("open"),
        "module",
        field("name", $._name),
        field("body", $.module_body)
      ),

    module_body: ($) => seq("{", repeat($.module_directive), "}"),

    module_directive: ($) =>
      seq(
        choice(
          seq("requires", repeat($.requires_modifier), $._name),
          seq("exports", $._name, optional("to"), optional($._name), repeat(seq(",", $._name))),
          seq("opens", $._name, optional("to"), optional($._name), repeat(seq(",", $._name))),
          seq("uses", $._name),
          seq("provides", $._name, "with", $._name, repeat(seq(",", $._name)))
        ),
        ";"
      ),

    requires_modifier: ($) => choice("transitive", "static"),

    package_declaration: ($) => seq(repeat($._annotation), "package", $._name, ";"),

    import_declaration: ($) =>
      seq("import", optional("static"), $._name, optional(seq(".", $.asterisk)), ";"),

    asterisk: ($) => "*",

    enum_declaration: ($) =>
      seq(
        optional_with_placeholder("decorator_list", repeat1($._annotation)),
        optional_with_placeholder("modifiers_placeholder", $.modifiers),
        "enum",
        field("name", $.identifier),
        optional_with_placeholder("interfaces_placeholder", $.super_interfaces),
        field("body", $.enum_body)
      ),

    enum_body: ($) =>
      seq(
        "{",
        optional_with_placeholder(
          "enum_member_list",
          commaSep($.enum_constant),
          optional(","),
          optional($.enum_body_declarations)
        ),
        "}"
      ),

    enum_body_declarations: ($) => seq(";", repeat($._class_body_declaration)),

    enum_constant: ($) =>
      seq(
        optional($.modifiers),
        field("name", $.identifier),
        optional($.arguments),
        field("body", optional($.class_body))
      ),

    class_declaration: ($) =>
      seq(
        optional_with_placeholder("decorator_list", repeat1($._annotation)),
        optional_with_placeholder("modifiers_placeholder", $.modifiers),
        "class",
        field("name", $.identifier),
        optional(field("type_parameters", $.type_parameters)),
        optional_with_placeholder("superclass_placeholder", $.superclass),
        optional_with_placeholder("interfaces_placeholder", $.super_interfaces),
        field("body", $.class_body)
      ),

    modifiers: ($) =>
      repeat1(
        choice(
          "public",
          "protected",
          "private",
          "abstract",
          "static",
          "final",
          "strictfp",
          "default",
          "synchronized",
          "native",
          "transient",
          "volatile"
        )
      ),

    type_parameters: ($) => seq("<", commaSep1($.type_parameter), ">"),

    type_parameter: ($) => seq(repeat($._annotation), $.identifier, optional($.type_bound)),

    type_bound: ($) => seq("extends", $._type, repeat(seq("&", $._type))),

    superclass: ($) => seq("extends", $.extends_type),

    super_interfaces: ($) => seq("implements", $.interface_type_list),

    interface_type_list: ($) => seq($.implements_type, repeat(seq(",", $.implements_type))),

    extends_type: ($) => $._type,

    implements_type: ($) => $._type,

    class_body: ($) =>
      seq(
        "{",
        optional_with_placeholder("class_member_list", repeat($._class_body_declaration)),
        "}"
      ),

    _class_body_declaration: ($) =>
      choice(
        $.field_declaration,
        $.record_declaration,
        $.method_declaration,
        $.class_declaration,
        $.interface_declaration,
        $.annotation_type_declaration,
        $.enum_declaration,
        $.block,
        $.static_initializer,
        $.constructor_declaration,
        ";"
      ),

    static_initializer: ($) => seq("static", $.block),

    constructor_declaration: ($) =>
      seq(
        optional_with_placeholder("decorator_list", repeat1($._annotation)),
        optional_with_placeholder("modifiers_placeholder", $.modifiers),
        $._constructor_declarator,
        optional_with_placeholder("throws_optional", $.throws),
        field("body", $.constructor_body)
      ),

    _constructor_declarator: ($) =>
      seq(
        field("type_parameters", optional($.type_parameters)),
        field("name", $.identifier),
        field("parameters", $.formal_parameters)
      ),

    constructor_body: ($) =>
      seq("{", optional($.explicit_constructor_invocation), repeat($.statement), "}"),

    explicit_constructor_invocation: ($) =>
      seq(
        choice(
          seq(
            field("type_arguments", optional($.type_arguments)),
            field("constructor", choice($.this, $.super))
          ),
          seq(
            field("object", choice($.primary_expression)),
            ".",
            field("type_arguments", optional($.type_arguments)),
            field("constructor", $.super)
          )
        ),
        $.arguments,
        ";"
      ),

    _name: ($) => choice($.identifier, $._reserved_identifier, $.scoped_identifier),

    scoped_identifier: ($) => seq(field("scope", $._name), ".", field("name", $.identifier)),

    field_declaration: ($) =>
      seq(
        optional_with_placeholder("decorator_list", repeat1($._annotation)),
        optional_with_placeholder("modifiers_placeholder", $.modifiers),
        field("type", $._unannotated_type),
        $.variable_declarator_list,
        ";"
      ),

    record_declaration: ($) =>
      seq(
        optional($.modifiers),
        "record",
        field("name", $.identifier),
        field("parameters", $.formal_parameters),
        field("body", $.class_body)
      ),

    annotation_type_declaration: ($) =>
      seq(
        optional($.modifiers),
        "@interface",
        field("name", $.identifier),
        field("body", $.annotation_type_body)
      ),

    annotation_type_body: ($) =>
      seq(
        "{",
        repeat(
          choice(
            $.annotation_type_element_declaration,
            $.constant_declaration,
            $.class_declaration,
            $.interface_declaration,
            $.annotation_type_declaration
          )
        ),
        "}"
      ),

    annotation_type_element_declaration: ($) =>
      seq(
        optional($.modifiers),
        field("type", $._unannotated_type),
        field("name", $.identifier),
        "(",
        ")",
        field("dimensions", optional($.dimensions)),
        optional($._default_value),
        ";"
      ),

    _default_value: ($) => seq("default", field("value", $._element_value)),

    interface_declaration: ($) =>
      seq(
        optional_with_placeholder("decorator_list", repeat1($._annotation)),
        optional_with_placeholder("modifiers_placeholder", $.modifiers),
        "interface",
        field("name", $.identifier),
        field("type_parameters", optional($.type_parameters)),
        optional_with_placeholder("extends_interfaces_placeholder", $.extends_interfaces),
        field("body", $.interface_body)
      ),

    extends_interfaces: ($) => seq("extends", $.extends_type_list),

    extends_type_list: ($) => seq("extends_type", $.extends_type, repeat(seq(",", $.extends_type))),

    interface_body: ($) =>
      seq(
        "{",
        optional_with_placeholder(
          "interface_member_list",
          repeat(
            choice(
              $.constant_declaration,
              $.enum_declaration,
              $.method_declaration,
              $.class_declaration,
              $.interface_declaration,
              $.annotation_type_declaration,
              ";"
            )
          )
        ),
        "}"
      ),

    constant_declaration: ($) =>
      seq(
        optional($.modifiers),
        field("type", $._unannotated_type),
        $._variable_declarator_list,
        ";"
      ),

    _variable_declarator_list: ($) => commaSep1(field("declarator", $.variable_declarator)),

    variable_declarator_list: ($) => $._variable_declarator_list,

    variable_declarator: ($) => choice($._variable_declarator_id, $.declarator_assignment),

    declarator_assignment: ($) =>
      seq(
        field("assignment_variable", $.variable_declarator_id),
        seq("=", field("assignment_value", $._variable_initializer))
      ),

    _variable_declarator_id: ($) =>
      seq(
        field("name", choice($.identifier, $._reserved_identifier)),
        field("dimensions", optional($.dimensions))
      ),

    variable_declarator_id: ($) => $._variable_declarator_id,

    _variable_initializer: ($) => choice($.expression, $.array_initializer),

    array_initializer: ($) => seq("{", commaSep($._variable_initializer), optional(","), "}"),

    // Types

    _type: ($) => choice($._unannotated_type, $.annotated_type),

    _unannotated_type: ($) => choice($._simple_type, $.array_type),

    _simple_type: ($) =>
      field(
        "type",
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

    annotated_type: ($) =>
      seq(field("type_decorator_list", repeat1($._annotation)), $._unannotated_type),

    scoped_type_identifier: ($) =>
      seq(
        choice(alias($.identifier, $.type_identifier), $.scoped_type_identifier, $.generic_type),
        ".",
        repeat($._annotation),
        alias($.identifier, $.type_identifier)
      ),

    generic_type: ($) =>
      prec.dynamic(
        PREC.GENERIC,
        seq(
          choice(alias($.identifier, $.type_identifier), $.scoped_type_identifier),
          $.type_arguments
        )
      ),

    array_type: ($) =>
      field("type", seq(field("element", $._unannotated_type), field("dimensions", $.dimensions))),

    integral_type: ($) => choice("byte", "short", "int", "long", "char"),

    floating_point_type: ($) => choice("float", "double"),

    boolean_type: ($) => "boolean",

    void_type: ($) => "void",

    method_header: ($) =>
      seq(
        optional(
          seq(
            field("type_parameters", $.type_parameters),
            optional_with_placeholder("decorator_list", repeat($._annotation))
          )
        ),
        field("type", $._unannotated_type),
        $.method_declarator,
        optional_with_placeholder("throws_placeholder", $.throws)
      ),

    method_declarator: ($) =>
      seq(
        field("name", choice($.identifier, $._reserved_identifier)),
        field("parameters", $.formal_parameters),
        optional(field("dimensions", $.dimensions))
      ),

    formal_parameters: ($) =>
      seq(
        "(",
        optional_with_placeholder(
          "parameter_list",
          seq(
            optional($.receiver_parameter),
            commaSep(choice($.formal_parameter, $.spread_parameter))
          )
        ),
        ")"
      ),

    formal_parameter: ($) =>
      seq(
        optional_with_placeholder("modifiers_placeholder", $.modifiers),
        field("type", $._unannotated_type),
        $._variable_declarator_id
      ),

    receiver_parameter: ($) =>
      seq(repeat($._annotation), $._unannotated_type, optional(seq($.identifier, ".")), $.this),

    spread_parameter: ($) =>
      seq(
        optional_with_placeholder("modifiers_placeholder", $.modifiers),
        field("type", $._unannotated_type),
        "...",
        field("spread_parameter_variable", $.variable_declarator)
      ),

    throws: ($) => seq("throws", commaSep1($.throws_type)),

    throws_type: ($) => $._type,

    local_variable_declaration: ($) =>
      seq(
        optional($.modifiers),
        field("type", $._unannotated_type),
        $._variable_declarator_list,
        ";"
      ),

    method_declaration: ($) =>
      seq(
        optional_with_placeholder("decorator_list", repeat1($._annotation)),
        optional_with_placeholder("modifiers_placeholder", $.modifiers),
        $.method_header,
        choice(field("body", $.block), ";")
      ),

    _reserved_identifier: ($) => alias(choice("open", "module"), $.identifier),

    this: ($) => "this",

    super: ($) => "super",

    // https://docs.oracle.com/javase/specs/jls/se8/html/jls-3.html#jls-IdentifierChars
    identifier: ($) => /[\p{L}_$][\p{L}\p{Nd}_$]*/,

    // http://stackoverflow.com/questions/13014947/regex-to-match-a-c-style-multiline-comment/36328890#36328890
    comment: ($) =>
      token(
        prec(PREC.COMMENT, choice(seq("//", /.*/), seq("/*", /[^*]*\*+([^/*][^*]*\*+)*/, "/")))
      ),
  },
});

function sep1(rule, separator) {
  return seq(rule, repeat(seq(separator, rule)));
}

function commaSep1(rule) {
  return seq(rule, repeat(seq(",", rule)));
}

function commaSep(rule) {
  return optional(commaSep1(rule));
}

function optional_with_placeholder(field_name, rule) {
  return choice(field(field_name, rule), field(field_name, blank()));
}
