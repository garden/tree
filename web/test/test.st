" 
    This is a test of the Smalltalk code
"
Seaside.WAComponent subclass: #MyCounter [
    | count |
    MyCounter class >> canBeRoot [ ^true ]

    initialize [
        super initialize.
        count := 0.
    ]
    states [ ^{ self } ]
    renderContentOn: html [
        html heading: count.
        html anchor callback: [ count := count + 1 ]; with: '++'.
        html space.
        html anchor callback: [ count := count - 1 ]; with: '--'.
    ]
]

MyCounter registerAsApplication: 'mycounter'

